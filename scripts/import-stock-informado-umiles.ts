import * as XLSX from "xlsx";
import fs from "node:fs";
import { excelPostgres } from "@/lib/excel-postgres-client-core";

// Uso: tsx scripts/import-stock-informado-umiles.ts "<4- Stock Umiles.xlsm>" [--dry-run]
// Carga la base de stock de Umiles (hoja "Umiles"): "Stock Informado" por código cliente, bulto,
// comentarios y valores de costo. Los movimientos (pedido, ingreso, egreso) los calcula la
// plataforma desde Tango y Egresos. Es repetible: actualiza los códigos que ya están, agrega los
// nuevos y NO borra los que ya no figuran en la hoja (salvo con --reemplazar).
const filePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const replaceAll = process.argv.includes("--reemplazar");
if (!filePath) {
  console.error('Uso: tsx scripts/import-stock-informado-umiles.ts "<archivo.xlsm>" [--dry-run]');
  process.exit(1);
}

const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

async function main() {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  const sheet = workbook.Sheets["Umiles"];
  if (!sheet) throw new Error('No encontré la hoja "Umiles".');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  const headerIndex = matrix.findIndex((row) => text(row[1]).toUpperCase().startsWith("CÓDIGO"));
  if (headerIndex < 0) throw new Error("No encontré la fila de encabezados.");
  const headers = matrix[headerIndex].map((header) => text(header).replace(/\s+/g, " ").toLowerCase());
  const col = (name: string) => headers.findIndex((header) => header === name.toLowerCase());
  const index = {
    comments: col("comentarios"),
    clientCode: 1,
    product: col("producto"),
    supplier: col("proveedor"),
    uniqueCode: col("código único"),
    category: col("categoria"),
    informed: col("stock informado"),
    packageSize: col("bulto"),
    dgCost: col("costo dg s/iva"),
    totalCost: col("total costo"),
    unitProfit: col("utilidad unitaria"),
    salePrice: col("pv"),
  };
  for (const [name, value] of Object.entries(index)) {
    if (value < 0) throw new Error(`No encontré la columna "${name}" en la hoja.`);
  }

  const seen = new Set<string>();
  type StockInput = {
    client: string;
    comments: string | null;
    clientCode: string;
    product: string | null;
    supplier: string | null;
    uniqueCode: string | null;
    category: string | null;
    informedStock: number;
    packageSize: number | null;
    dgCostNoVat: number;
    totalCost: number;
    unitProfit: number;
    salePrice: number;
    sourceRowNumber: number;
  };
  const rows: StockInput[] = [];
  let duplicated = 0;
  for (let i = headerIndex + 1; i < matrix.length; i += 1) {
    const row = matrix[i];
    const clientCode = text(row[index.clientCode]);
    if (!clientCode || !/^urb-/i.test(clientCode)) continue;
    const key = clientCode.toLowerCase();
    if (seen.has(key)) {
      duplicated += 1;
      continue;
    }
    seen.add(key);
    rows.push({
      client: "Umiles",
      comments: text(row[index.comments]) || null,
      clientCode,
      product: text(row[index.product]) || null,
      supplier: text(row[index.supplier]) || null,
      uniqueCode: text(row[index.uniqueCode]).toLowerCase() || null,
      category: text(row[index.category]) || null,
      informedStock: num(row[index.informed]),
      packageSize: row[index.packageSize] === "" ? null : num(row[index.packageSize]),
      dgCostNoVat: num(row[index.dgCost]),
      totalCost: num(row[index.totalCost]),
      unitProfit: num(row[index.unitProfit]),
      salePrice: num(row[index.salePrice]),
      sourceRowNumber: i + 1,
    });
  }
  const informedTotal = rows.reduce((sum, row) => sum + row.informedStock, 0);
  console.log(`Filas de producto: ${rows.length} (repetidas descartadas: ${duplicated}). Stock informado total: ${informedTotal}. Con comentario: ${rows.filter((r) => r.comments).length}.`);

  const existing = await excelPostgres.excelSantanderStock.findMany({
    where: { client: { equals: "Umiles", mode: "insensitive" } },
    select: { id: true, clientCode: true, informedStock: true },
  });
  const existingByCode = new Map(existing.map((row) => [text(row.clientCode).toLowerCase(), row]));
  const toUpdate = rows.filter((row) => existingByCode.has(row.clientCode.toLowerCase()));
  const toCreate = rows.filter((row) => !existingByCode.has(row.clientCode.toLowerCase()));
  const changed = toUpdate.filter((row) => Number(existingByCode.get(row.clientCode.toLowerCase())?.informedStock ?? 0) !== row.informedStock);
  const notInSheet = existing.filter((row) => !rows.some((r) => r.clientCode.toLowerCase() === text(row.clientCode).toLowerCase()));
  console.log(`Ya en la base: ${existing.length}. A actualizar: ${toUpdate.length} (con stock informado distinto: ${changed.length}). A agregar: ${toCreate.length}. En la base y no en la hoja: ${notInSheet.length} (${replaceAll ? "se borran" : "se conservan"}).`);
  if (dryRun) {
    console.log("Dry run: no se escribió nada.");
    return;
  }
  await excelPostgres.$transaction(async (tx) => {
    if (replaceAll) await tx.excelSantanderStock.deleteMany({ where: { client: { equals: "Umiles", mode: "insensitive" } } });
    for (const row of replaceAll ? [] : toUpdate) {
      await tx.excelSantanderStock.update({ where: { id: existingByCode.get(row.clientCode.toLowerCase())!.id }, data: row });
    }
    const toInsert = replaceAll ? rows : toCreate;
    if (toInsert.length) await tx.excelSantanderStock.createMany({ data: toInsert });
  });
  console.log(`OK. Actualizadas: ${replaceAll ? 0 : toUpdate.length}. Agregadas: ${replaceAll ? rows.length : toCreate.length}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
