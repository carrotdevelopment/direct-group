import * as XLSX from "xlsx";
import fs from "node:fs";
import { excelPostgres } from "@/lib/excel-postgres-client-core";

// Uso: tsx scripts/import-amex-ofed-informado.ts "<4- Stock AMEX.xlsm>" [--vigente-desde=AAAAMM] [--dry-run]
// Completa lo que DB_Clientes no trae de la planilla de stock de Amex:
// 1. Códigos OFED: casi no figuran en DB_Clientes, y sin asignación la pantalla de Stock no los muestra. El
//    código único sale de las filas de egresos e ingresos o de CATALOGO OFED. Quedan vigentes los que tuvieron
//    movimiento desde --vigente-desde o tienen stock en Urbano.
// 2. Stock informado: hoja "Oculto y Stock Informado" (DG99) y CATALOGO OFED. Actualiza lo que ya está.
const filePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const activeFrom = Number(process.argv.find((value) => value.startsWith("--vigente-desde="))?.split("=")[1] ?? "202608");
if (!filePath) {
  console.error('Uso: tsx scripts/import-amex-ofed-informado.ts "<archivo.xlsm>" [--vigente-desde=AAAAMM] [--dry-run]');
  process.exit(1);
}

const CLIENT = "Amex";
const text = (value: unknown) => String(value ?? "").trim();
const norm = (value: unknown) => text(value).toLowerCase();
const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const usableUnique = (value: unknown) => {
  const unique = norm(value);
  return unique && !unique.startsWith("#") && !unique.includes("revisar") && unique !== "0" ? unique : "";
};

function readSheet(workbook: XLSX.WorkBook, sheet: string, firstHeader: string, headerColumn = 0) {
  if (!workbook.Sheets[sheet]) throw new Error(`No encontré la hoja ${sheet}.`);
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet], { header: 1, defval: "", raw: true });
  const headerIndex = matrix.findIndex((row) => norm(row[headerColumn]) === firstHeader.toLowerCase());
  if (headerIndex < 0) throw new Error(`No encontré el encabezado de ${sheet}.`);
  const headers = matrix[headerIndex].map((header) => norm(header));
  const col = (name: string) => {
    const index = headers.indexOf(name.toLowerCase());
    if (index < 0) throw new Error(`Falta la columna "${name}" en ${sheet}.`);
    return index;
  };
  return { rows: matrix.slice(headerIndex + 1), firstRow: headerIndex + 2, col };
}

type CodeInfo = { first: number; last: number; uniques: Map<string, number> };

async function main() {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  const info = new Map<string, CodeInfo & { clientCode: string }>();
  const touch = (rawCode: unknown, period: number, unique: unknown) => {
    const clientCode = text(rawCode);
    if (!/^ofed/i.test(clientCode)) return;
    const item = info.get(norm(clientCode)) ?? { clientCode, first: 0, last: 0, uniques: new Map<string, number>() };
    if (period > 0) {
      item.first = item.first ? Math.min(item.first, period) : period;
      item.last = Math.max(item.last, period);
    }
    const usable = usableUnique(unique);
    if (usable) item.uniques.set(usable, (item.uniques.get(usable) ?? 0) + 1);
    info.set(norm(clientCode), item);
  };
  const periodOf = (year: unknown, month: unknown) => {
    const y = num(year), m = num(month);
    return y >= 2015 && y <= 2030 && m >= 1 && m <= 12 ? y * 100 + m : 0;
  };

  const egress = readSheet(workbook, "EgresosAmex", "Día");
  const e = { code: egress.col("Codigo cliente"), month: egress.col("Mes"), year: egress.col("Año"), unique: egress.col("Código Único") };
  for (const row of egress.rows) touch(row[e.code], periodOf(row[e.year], row[e.month]), row[e.unique]);
  const income = readSheet(workbook, "IngresosAmex", "Cliente");
  const i = { code: income.col("Código Cliente"), month: income.col("Mes entrega"), year: income.col("Año entrega"), unique: income.col("Código Único") };
  for (const row of income.rows) touch(row[i.code], periodOf(row[i.year], row[i.month]), row[i.unique]);
  const catalog = readSheet(workbook, "CATALOGO OFED", "Codigo Unico", 1);
  const c = { code: catalog.col("CÓDIGO"), unique: catalog.col("Codigo Unico"), product: catalog.col("PRODUCTO"), supplier: catalog.col("PROVEEDOR"), informed: catalog.col("Stock informado") };
  for (const row of catalog.rows) touch(row[c.code], 0, row[c.unique]);

  // ---------- 1. Códigos OFED
  const lastLoad = await excelPostgres.urbanoStockLoad.findFirst({ orderBy: { reportDate: "desc" }, select: { id: true } });
  const [existing, activeOther, products, urbanoItems] = await Promise.all([
    excelPostgres.excelClientCode.findMany({ where: { client: { equals: CLIENT, mode: "insensitive" } }, select: { id: true, clientCode: true, uniqueCode: true, active: true, voidedAt: true } }),
    excelPostgres.excelClientCode.findMany({ where: { active: true, NOT: { client: { equals: CLIENT, mode: "insensitive" } } }, select: { clientCode: true, client: true } }),
    excelPostgres.excelProduct.findMany({ select: { uniqueCode: true } }),
    lastLoad ? excelPostgres.urbanoStockItem.findMany({ where: { loadId: lastLoad.id }, select: { clientCode: true, quantity: true } }) : [],
  ]);
  const urbano = new Map(urbanoItems.map((row) => [norm(row.clientCode), Number(row.quantity)]));
  const otherClient = new Map(activeOther.map((row) => [norm(row.clientCode), text(row.client)]));
  const haveProduct = new Set(products.map((row) => norm(row.uniqueCode)));
  const existingByCode = new Map<string, typeof existing>();
  for (const row of existing) existingByCode.set(norm(row.clientCode), [...(existingByCode.get(norm(row.clientCode)) ?? []), row]);

  const isActive = (code: string, item: CodeInfo) => item.last >= activeFrom || (urbano.get(code) ?? 0) > 0;
  const fresh: Array<{ clientCode: string; uniqueCode: string; first: number; active: boolean }> = [];
  const activate: bigint[] = [];
  const withoutUnique: string[] = [];
  const conflicts: string[] = [];
  const noProduct = new Set<string>();
  for (const [code, item] of info) {
    if (otherClient.has(code)) {
      conflicts.push(`${item.clientCode} (${otherClient.get(code)})`);
      continue;
    }
    const assigned = existingByCode.get(code);
    if (assigned?.length) {
      if (isActive(code, item) && !assigned.some((row) => row.active)) {
        const target = assigned.find((row) => !row.voidedAt);
        if (target) activate.push(target.id);
      }
      continue;
    }
    const uniqueCode = [...item.uniques.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!uniqueCode) {
      withoutUnique.push(item.clientCode);
      continue;
    }
    if (!haveProduct.has(uniqueCode)) noProduct.add(uniqueCode);
    fresh.push({ clientCode: item.clientCode, uniqueCode, first: item.first || 202301, active: isActive(code, item) });
  }
  console.log(
    `OFED: códigos en la planilla ${info.size} | a cargar ${fresh.length} (vigentes ${fresh.filter((row) => row.active).length}) | ya asignados que pasan a vigentes ${activate.length} | ` +
    `sin código único (no se cargan) ${withoutUnique.length} | vigentes en otro cliente (no se tocan) ${conflicts.length} | códigos únicos sin producto ${noProduct.size}`,
  );
  if (withoutUnique.length) console.log(`  sin código único: ${withoutUnique.slice(0, 40).join(", ")}`);
  if (conflicts.length) console.log(`  en otro cliente: ${conflicts.slice(0, 40).join(", ")}`);
  if (noProduct.size) console.log(`  sin producto: ${[...noProduct].slice(0, 40).join(", ")}`);

  // ---------- 2. Stock informado
  const informed = new Map<string, { clientCode: string; informedStock: number; product: string | null; supplier: string | null; uniqueCode: string | null; sourceRowNumber: number }>();
  const hidden = readSheet(workbook, "Oculto y Stock Informado", "Codigo Cliente");
  const h = { code: hidden.col("Codigo Cliente"), informed: hidden.col("Stock Informado") };
  hidden.rows.forEach((row, index) => {
    const clientCode = text(row[h.code]);
    if (!clientCode) return;
    const current = informed.get(norm(clientCode));
    informed.set(norm(clientCode), {
      clientCode, informedStock: (current?.informedStock ?? 0) + num(row[h.informed]), product: null, supplier: null, uniqueCode: null, sourceRowNumber: hidden.firstRow + index,
    });
  });
  catalog.rows.forEach((row, index) => {
    const clientCode = text(row[c.code]);
    if (!clientCode || informed.has(norm(clientCode))) return;
    informed.set(norm(clientCode), {
      clientCode, informedStock: num(row[c.informed]), product: text(row[c.product]) || null, supplier: text(row[c.supplier]) || null,
      uniqueCode: usableUnique(row[c.unique]) || null, sourceRowNumber: catalog.firstRow + index,
    });
  });
  const stockExisting = await excelPostgres.excelSantanderStock.findMany({ where: { client: { equals: CLIENT, mode: "insensitive" } }, select: { id: true, clientCode: true } });
  const stockByCode = new Map(stockExisting.map((row) => [norm(row.clientCode), row.id]));
  const rows = [...informed.entries()];
  console.log(
    `STOCK INFORMADO: códigos ${rows.length} (total ${rows.reduce((sum, [, row]) => sum + row.informedStock, 0)}) | ya en la base ${rows.filter(([code]) => stockByCode.has(code)).length} | a agregar ${rows.filter(([code]) => !stockByCode.has(code)).length}`,
  );

  if (dryRun) {
    console.log("Dry run: no se escribió nada.");
    return;
  }

  await excelPostgres.$transaction(
    async (tx) => {
      if (fresh.length) {
        await tx.excelClientCode.createMany({
          data: fresh.map((row) => ({
            client: CLIENT, uniqueCode: row.uniqueCode, clientCode: row.clientCode,
            assignmentYear: Math.floor(row.first / 100), assignmentMonth: row.first % 100, active: row.active,
          })),
        });
      }
      if (activate.length) await tx.excelClientCode.updateMany({ where: { id: { in: activate } }, data: { active: true } });
      for (const [code, row] of rows) {
        const id = stockByCode.get(code);
        if (id) await tx.excelSantanderStock.update({ where: { id }, data: { informedStock: row.informedStock } });
      }
      const toAdd = rows.filter(([code]) => !stockByCode.has(code)).map(([, row]) => ({ client: CLIENT, ...row }));
      for (let offset = 0; offset < toAdd.length; offset += 1000) {
        await tx.excelSantanderStock.createMany({ data: toAdd.slice(offset, offset + 1000) });
      }
    },
    { timeout: 600_000 },
  );
  console.log(`OK. Códigos OFED cargados ${fresh.length}, pasados a vigentes ${activate.length}, stock informado ${rows.length}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
