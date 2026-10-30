import * as XLSX from "xlsx";
import fs from "node:fs";
import { excelPostgres } from "@/lib/excel-postgres-client-core";

// Uso: tsx scripts/import-egresos-umiles-delta.ts "<3 - Ingresos y Egresos Umiles.xlsm>" [--dry-run]
// Carga solo los egresos de la hoja EgresosUmilles que todavía no están en la base (cruce por fecha +
// código cliente + operación + cantidad, respetando repeticiones). No usa el perfil de importación de
// la base (hoy está armado para el reporte de canjes de Urbano): escribe las filas directamente, con
// el código único y el producto de la asignación vigente del código. Descarta filas repetidas con el
// mismo Nº Seg.
const filePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!filePath) {
  console.error('Uso: tsx scripts/import-egresos-umiles-delta.ts "<archivo.xlsm>" [--dry-run]');
  process.exit(1);
}
const AUTHOR = "migracion-excel-umiles";
const text = (value: unknown) => String(value ?? "").trim();
const norm = (value: unknown) => text(value).toLowerCase();
const num = (value: unknown) => {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const pad = (n: number) => String(n).padStart(2, "0");
// Los egresos importados guardan ROBO_AJUSTE; el resto de los nombres coincide con la planilla.
const operationOf = (value: unknown) => {
  const raw = text(value).toUpperCase().replace(/\s+/g, "_");
  if (raw.includes("PASAJE")) return "PASAJE";
  if (raw.includes("ROBO") || raw.includes("AJUSTE")) return "ROBO_AJUSTE";
  if (raw.includes("CAMBIO")) return "CAMBIO";
  if (raw.includes("REENVIO")) return "REENVIO";
  return "CANJE";
};

async function main() {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["EgresosUmilles"], { header: 1, defval: "", raw: true });
  const headerIndex = matrix.findIndex((row) => text(row[0]) === "Dia");
  if (headerIndex < 0) throw new Error("No encontré el encabezado (columna Dia) en EgresosUmilles.");
  const headers = matrix[headerIndex].map((header) => text(header));
  const col = (name: string) => headers.findIndex((header) => header.toLowerCase() === name.toLowerCase());
  const index = {
    day: col("Dia"), month: col("Mes"), year: col("Año"), code: col("Código Cliente"), operation: col("Operación"),
    product: col("PRODUCTO"), quantity: col("Cantidad"), seq: col("Nº Seg"), destination: col("Destino"),
    comments: col("Comentarios"), unique: col("Código Único"),
  };
  for (const [name, value] of Object.entries(index)) if (value < 0) throw new Error(`Falta la columna ${name}.`);

  type Item = { date: string; clientCode: string; operation: string; quantity: number; product: string; destination: string; comments: string; unique: string; seq: string; sheetRow: number };
  const items: Item[] = [];
  const seenSeq = new Set<string>();
  let repeatedSeq = 0;
  let invalid = 0;
  matrix.slice(headerIndex + 1).forEach((row, i) => {
    const clientCode = text(row[index.code]);
    if (!clientCode || row[index.day] === "") return;
    const year = Math.abs(num(row[index.year])); // algunas filas traen -2025: el año real es el positivo
    const month = num(row[index.month]);
    const day = num(row[index.day]);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
      invalid += 1;
      return;
    }
    const operation = operationOf(row[index.operation]);
    const quantity = num(row[index.quantity]);
    const date = `${year}-${pad(month)}-${pad(day)}`;
    const seq = text(row[index.seq]);
    if (seq) {
      const key = `${seq}|${date}|${norm(clientCode)}|${operation}|${quantity}`;
      if (seenSeq.has(key)) {
        repeatedSeq += 1;
        return;
      }
      seenSeq.add(key);
    }
    items.push({
      date, clientCode, operation, quantity, product: text(row[index.product]),
      destination: text(row[index.destination]), comments: text(row[index.comments]),
      unique: norm(row[index.unique]), seq, sheetRow: headerIndex + 2 + i,
    });
  });

  const existing = await excelPostgres.egress.findMany({
    where: { client: { equals: "Umiles", mode: "insensitive" }, deletedAt: null },
    select: { date: true, clientCode: true, operation: true, quantity: true },
  });
  const have = new Map<string, number>();
  for (const row of existing) {
    const key = `${row.date ? row.date.toISOString().slice(0, 10) : ""}|${norm(row.clientCode)}|${operationOf(row.operation)}|${num(row.quantity)}`;
    have.set(key, (have.get(key) ?? 0) + 1);
  }
  const fresh: Item[] = [];
  for (const item of items) {
    const key = `${item.date}|${norm(item.clientCode)}|${item.operation}|${item.quantity}`;
    const remaining = have.get(key) ?? 0;
    if (remaining > 0) have.set(key, remaining - 1);
    else fresh.push(item);
  }
  console.log(`Filas en la planilla: ${items.length} (repetidas por Nº Seg descartadas: ${repeatedSeq}; fecha inválida: ${invalid}). En la base: ${existing.length}. Nuevas: ${fresh.length}.`);
  for (const item of fresh.slice(0, 25)) {
    console.log(`  + ${item.date} ${item.clientCode} ${item.operation} x${item.quantity} destino="${item.destination}" comentario="${item.comments}" (fila ${item.sheetRow})`);
  }
  if (dryRun || fresh.length === 0) {
    console.log(dryRun ? "Dry run: no se escribió nada." : "No hay filas nuevas.");
    return;
  }

  const [codes, products] = await Promise.all([
    excelPostgres.excelClientCode.findMany({
      where: { client: { equals: "Umiles", mode: "insensitive" } },
      orderBy: [{ active: "desc" }, { assignmentYear: "desc" }, { assignmentMonth: "desc" }, { id: "desc" }],
    }),
    excelPostgres.excelProduct.findMany({ select: { uniqueCode: true, product: true } }),
  ]);
  const uniqueByCode = new Map<string, string>();
  for (const code of codes) if (!uniqueByCode.has(norm(code.clientCode))) uniqueByCode.set(norm(code.clientCode), norm(code.uniqueCode));
  const productByUnique = new Map(products.map((p) => [norm(p.uniqueCode), text(p.product)]));
  await excelPostgres.egress.createMany({
    data: fresh.map((item) => {
      const unique = item.unique || uniqueByCode.get(norm(item.clientCode)) || "";
      return {
        client: "Umiles",
        operation: item.operation,
        date: new Date(`${item.date}T00:00:00.000Z`),
        clientCode: item.clientCode,
        uniqueCode: unique || null,
        product: item.product || productByUnique.get(unique) || null,
        quantity: item.quantity,
        destination: item.destination || null,
        comments: item.comments || null,
        createdBy: AUTHOR,
      };
    }),
  });
  console.log(`OK. ${fresh.length} egresos cargados.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
