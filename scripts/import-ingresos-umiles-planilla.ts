import * as XLSX from "xlsx";
import fs from "node:fs";
import { excelPostgres } from "@/lib/excel-postgres-client-core";

// Uso: tsx scripts/import-ingresos-umiles-planilla.ts "<4- Stock Umiles.xlsm>" [--desde=AAAA-MM-DD] [--dry-run]
// Paso A: carga como ingreso PASAJE las filas de la hoja IngresosUmiles ya entregadas (fecha de entrega
//   desde --desde, por defecto 2026-10-14) que todavía no están en la base, salvo que Tango ya haya
//   registrado un ajuste de ese código con fecha igual o posterior (Tango carga los pasajes en bloque).
// Paso B: Tango vuelve a cargar en bloque pasajes que la planilla ya tenía y que se habían igualado
//   antes; por cada código cuyo ingreso físico supera al de la planilla exactamente por esos ajustes
//   de Tango, se agrega una fila negativa ROBO/AJUSTE para no contarlos dos veces.
// Todas las filas quedan con created_by "migracion-excel-umiles" y pendientes de Tango.
// Los códigos cuya diferencia no se explica así se informan y no se tocan.
const filePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const since = process.argv.find((value) => value.startsWith("--desde="))?.split("=")[1] ?? "2026-10-14";
if (!filePath) {
  console.error('Uso: tsx scripts/import-ingresos-umiles-planilla.ts "<archivo.xlsm>" [--desde=AAAA-MM-DD] [--dry-run]');
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
const dateOf = (day: unknown, month: unknown, year: unknown) => {
  const d = num(day), m = num(month), y = num(year);
  if (!d || !m || !y) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};

type Row = {
  sheetRow: number;
  operation: string;
  orderDate: string | null;
  orderNumber: string;
  code: string;
  clientCode: string;
  quantity: number;
  origin: string;
  deliveryDate: string | null;
  delivered: number;
};

async function main() {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["IngresosUmiles"], { header: 1, defval: "", raw: true });
  const headerIndex = matrix.findIndex((row) => text(row[0]) === "Cliente");
  if (headerIndex < 0) throw new Error("No encontré el encabezado de IngresosUmiles.");
  const planilla: Row[] = [];
  matrix.slice(headerIndex + 1).forEach((row, index) => {
    const clientCode = text(row[6]);
    if (!/^urb-/i.test(clientCode)) return;
    planilla.push({
      sheetRow: headerIndex + 2 + index,
      operation: text(row[1]).toUpperCase(),
      orderDate: dateOf(row[2], row[3], row[4]),
      orderNumber: text(row[5]),
      code: norm(clientCode),
      clientCode,
      quantity: num(row[7]),
      origin: text(row[8]),
      deliveryDate: dateOf(row[9], row[10], row[11]),
      delivered: num(row[12]),
    });
  });

  const db = await excelPostgres.tangoIncome.findMany({
    where: { clientCode: { startsWith: "URB-", mode: "insensitive" } },
    select: { clientCode: true, operation: true, quantity: true, deliveredQuantity: true, deliveryDate: true, createdBy: true },
  });
  const iso = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : "");
  const have = new Map<string, number>();
  for (const row of db) {
    const key = `${norm(row.clientCode)}|${num(row.deliveredQuantity)}|${iso(row.deliveryDate)}`;
    have.set(key, (have.get(key) ?? 0) + 1);
  }
  // Ajustes de Tango (no cargados por esta migración) por código, con su fecha.
  const tangoAdjustments = db.filter(
    (row) => !row.createdBy && text(row.operation).toUpperCase().startsWith("AJUSTE") && iso(row.deliveryDate) >= since,
  );
  const lastAdjustment = new Map<string, string>();
  const adjustmentSums = new Map<string, { q: number; d: number }>();
  for (const row of tangoAdjustments) {
    const code = norm(row.clientCode);
    const date = iso(row.deliveryDate);
    if (date > (lastAdjustment.get(code) ?? "")) lastAdjustment.set(code, date);
    const sum = adjustmentSums.get(code) ?? { q: 0, d: 0 };
    sum.q += num(row.quantity);
    sum.d += num(row.deliveredQuantity);
    adjustmentSums.set(code, sum);
  }

  // ---- Paso A
  const toLoad: Row[] = [];
  const skippedByTango: Row[] = [];
  for (const row of planilla) {
    if (row.operation !== "PASAJE" || !row.deliveryDate || row.delivered <= 0 || row.deliveryDate < since) continue;
    const key = `${row.code}|${row.delivered}|${row.deliveryDate}`;
    if ((have.get(key) ?? 0) > 0) {
      have.set(key, (have.get(key) ?? 0) - 1);
      continue;
    }
    if ((lastAdjustment.get(row.code) ?? "") >= row.deliveryDate) {
      skippedByTango.push(row);
      continue;
    }
    toLoad.push(row);
  }
  const byOrder: Record<string, { filas: number; unidades: number }> = {};
  for (const row of toLoad) {
    const entry = byOrder[row.orderNumber] ?? { filas: 0, unidades: 0 };
    entry.filas += 1;
    entry.unidades += row.delivered;
    byOrder[row.orderNumber] = entry;
  }
  console.log(`PASO A: pasajes entregados desde ${since} que faltan en la base: ${toLoad.length} filas, ${toLoad.reduce((s, r) => s + r.delivered, 0)} u. Por pedido: ${JSON.stringify(byOrder)}`);
  if (skippedByTango.length) {
    console.log(`  omitidas porque Tango ya registró un ajuste de ese código: ${skippedByTango.length} filas (${skippedByTango.map((r) => r.clientCode).join(", ")})`);
  }

  // ---- Paso B
  const planillaTotals = new Map<string, number>();
  for (const row of planilla) {
    if (!["COMPRA", "PASAJE", "ROBO/AJUSTE", "DEVOLUCION"].includes(row.operation)) continue;
    planillaTotals.set(row.code, (planillaTotals.get(row.code) ?? 0) + row.delivered);
  }
  const platformTotals = new Map<string, number>();
  for (const row of db) {
    const op = text(row.operation).toUpperCase();
    if (!["COMPRA", "PASAJE", "ROBO/AJUSTE", "DEVOLUCION", "AJUSTE NO VALORIZADO", "AJUSTE VALORIZADO"].includes(op)) continue;
    platformTotals.set(norm(row.clientCode), (platformTotals.get(norm(row.clientCode)) ?? 0) + num(row.deliveredQuantity));
  }
  for (const row of toLoad) platformTotals.set(row.code, (platformTotals.get(row.code) ?? 0) + row.delivered);

  const compensations: { clientCode: string; q: number; d: number }[] = [];
  const unexplained: string[] = [];
  let leftOver = 0;
  let leftUnder = 0;
  for (const code of new Set([...platformTotals.keys(), ...planillaTotals.keys()])) {
    const diff = (platformTotals.get(code) ?? 0) - (planillaTotals.get(code) ?? 0);
    if (diff === 0) continue;
    const adj = adjustmentSums.get(code);
    if (diff > 0 && adj && adj.d === diff) {
      compensations.push({ clientCode: code.toUpperCase(), q: -adj.q, d: -adj.d });
    } else {
      unexplained.push(`${code.toUpperCase()}: plataforma ${platformTotals.get(code) ?? 0} / planilla ${planillaTotals.get(code) ?? 0} (dif ${diff > 0 ? "+" : ""}${diff})`);
      if (diff > 0) leftOver += diff;
      else leftUnder += -diff;
    }
  }
  console.log(`PASO B: códigos con ajuste de Tango ya contado en la planilla: ${compensations.length} (se restan ${compensations.reduce((s, c) => s - c.d, 0)} u).`);
  console.log(`  diferencias sin explicar (no se tocan): ${unexplained.length} códigos | plataforma de más ${leftOver} u | de menos ${leftUnder} u`);
  for (const line of unexplained.slice(0, 20)) console.log("    ", line);

  if (dryRun) {
    console.log("Dry run: no se escribió nada.");
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  await excelPostgres.$transaction(async (tx) => {
    for (const row of toLoad) {
      await tx.tangoIncome.create({
        data: {
          client: "Umiles",
          operation: "PASAJE",
          orderDate: row.orderDate ? new Date(`${row.orderDate}T00:00:00.000Z`) : null,
          purchaseOrder: row.orderNumber || null,
          clientCode: row.clientCode,
          quantity: row.quantity,
          transferOrigin: row.origin || null,
          deliveryDate: new Date(`${row.deliveryDate}T00:00:00.000Z`),
          deliveredQuantity: row.delivered,
          comments: `Pasaje de la planilla IngresosUmilles fila ${row.sheetRow} (sin baja en el origen)`,
          pendingTangoEntry: true,
          createdBy: AUTHOR,
        },
      });
    }
    for (const item of compensations) {
      await tx.tangoIncome.create({
        data: {
          client: "Umiles",
          operation: "ROBO/AJUSTE",
          orderDate: new Date(`${today}T00:00:00.000Z`),
          clientCode: item.clientCode,
          quantity: item.q,
          deliveryDate: new Date(`${today}T00:00:00.000Z`),
          deliveredQuantity: item.d,
          comments: "Resta el ajuste en bloque que Tango cargó después de que la planilla ya tenía esos pasajes (evita doble conteo)",
          pendingTangoEntry: true,
          createdBy: AUTHOR,
        },
      });
    }
  });
  console.log(`OK. Pasajes cargados: ${toLoad.length}. Compensaciones: ${compensations.length}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
