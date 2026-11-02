import * as XLSX from "xlsx";
import fs from "node:fs";
import { excelPostgres } from "@/lib/excel-postgres-client-core";
import { stockIncomeOperations, stockOperation, STOCK_EGRESS_OPERATIONS } from "@/lib/stock-operations";

// Uso: tsx scripts/import-stock-pampa-planilla.ts "<4- Stock Pampa.xlsm>" [--fecha=AAAA-MM-DD] [--sin-pasajes-del=AAAA-MM-DD] [--dry-run]
// Deja el stock de Pampa en la plataforma igual al de la planilla:
// 1. Egresos: carga las filas de EgresosPampa que todavía no están en la base (cruce por fecha + código
//    cliente + operación + cantidad, respetando repeticiones). Las de la base que no están en la planilla
//    se informan y no se tocan. Con --sin-pasajes-del no se cargan los PASAJE de ese día: son de una
//    solicitud de pasaje que se carga en la plataforma (Pasajes), que descuenta el origen al confirmarse.
// 2. Códigos: los códigos de Pampa que no tienen asignación vigente ni referencia histórica se agregan a
//    tango_client_code_map, así los ingresos de códigos viejos (no vigentes) se le asignan a Pampa.
// 3. Ingresos: por cada código, si lo entregado que cuenta para el stock en la plataforma no es igual a
//    lo entregado en IngresosPampa, agrega una fila ROBO/AJUSTE con la diferencia (suma o resta),
//    pendiente de Tango (si no, la sincronización con Tango frena por ingresos sin ID de Tango).
// Egresos e ingresos quedan con created_by "migracion-excel-pampa" (para revertir, borrar esas filas de egresos y
// tango_ingresos; los códigos agregados a tango_client_code_map se reconocen por su created_at).
const filePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
const adjustmentDate = arg("fecha") ?? new Date().toISOString().slice(0, 10);
const skipPasajesOf = arg("sin-pasajes-del");
if (!filePath) {
  console.error('Uso: tsx scripts/import-stock-pampa-planilla.ts "<archivo.xlsm>" [--fecha=AAAA-MM-DD] [--sin-pasajes-del=AAAA-MM-DD] [--dry-run]');
  process.exit(1);
}
const CLIENT = "Pampa";
const AUTHOR = "migracion-excel-pampa";
const text = (value: unknown) => String(value ?? "").trim();
const norm = (value: unknown) => text(value).toLowerCase();
const num = (value: unknown) => {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const pad = (n: number) => String(n).padStart(2, "0");
// Los egresos importados guardan ROBO_AJUSTE; el resto de los nombres coincide con la planilla.
const egressOperationOf = (value: unknown) => {
  const raw = text(value).toUpperCase().replace(/\s+/g, "_");
  if (raw.includes("PASAJE")) return "PASAJE";
  if (raw.includes("ROBO") || raw.includes("AJUSTE")) return "ROBO_AJUSTE";
  if (raw.includes("CAMBIO")) return "CAMBIO";
  if (raw.includes("REENVIO")) return "REENVIO";
  return "CANJE";
};

function readMatrix(workbook: XLSX.WorkBook, sheet: string, firstHeader: string) {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet], { header: 1, defval: "", raw: true });
  const headerIndex = matrix.findIndex((row) => norm(row[0]) === firstHeader.toLowerCase());
  if (headerIndex < 0) throw new Error(`No encontré el encabezado de ${sheet}.`);
  const headers = matrix[headerIndex].map((header) => norm(header));
  const col = (name: string) => {
    const index = headers.indexOf(name.toLowerCase());
    if (index < 0) throw new Error(`Falta la columna "${name}" en ${sheet}.`);
    return index;
  };
  return { rows: matrix.slice(headerIndex + 1), firstRow: headerIndex + 2, col };
}

async function main() {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });

  // ---------- 1. Egresos
  const egressSheet = readMatrix(workbook, "EgresosPampa", "Día");
  const e = {
    day: egressSheet.col("Día"), month: egressSheet.col("Mes"), year: egressSheet.col("Año"), code: egressSheet.col("Código Cliente"),
    quantity: egressSheet.col("Cantidad"), operation: egressSheet.col("Operación"), destination: egressSheet.col("Destino"),
    comments: egressSheet.col("Comentarios"), unique: egressSheet.col("Código Único"), product: egressSheet.col("DB_Producto.Producto"),
    description: egressSheet.col("Descripcion"),
  };
  type EgressItem = { date: string; clientCode: string; operation: string; quantity: number; product: string; destination: string; comments: string; unique: string; sheetRow: number };
  const egressItems: EgressItem[] = [];
  let invalidEgress = 0;
  let skippedPasajes = 0;
  egressSheet.rows.forEach((row, i) => {
    const clientCode = text(row[e.code]);
    if (!clientCode) return;
    const year = Math.abs(num(row[e.year]));
    const month = num(row[e.month]);
    const day = num(row[e.day]);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
      invalidEgress += 1;
      return;
    }
    const date = `${year}-${pad(month)}-${pad(day)}`;
    const operation = egressOperationOf(row[e.operation]);
    if (operation === "PASAJE" && date === skipPasajesOf) {
      skippedPasajes += 1;
      console.log(`  pasaje del ${date} que no se carga: ${clientCode} x${num(row[e.quantity])} → ${text(row[e.destination])}`);
      return;
    }
    egressItems.push({
      date,
      clientCode,
      operation,
      quantity: num(row[e.quantity]),
      product: text(row[e.product]) || text(row[e.description]),
      destination: text(row[e.destination]),
      comments: text(row[e.comments]),
      unique: norm(row[e.unique]),
      sheetRow: egressSheet.firstRow + i,
    });
  });
  const existingEgress = await excelPostgres.egress.findMany({
    where: { client: { equals: CLIENT, mode: "insensitive" }, deletedAt: null },
    select: { date: true, clientCode: true, operation: true, quantity: true },
  });
  const egressKey = (date: string, code: unknown, operation: string, quantity: number) => `${date}|${norm(code)}|${operation}|${quantity}`;
  const haveEgress = new Map<string, number>();
  for (const row of existingEgress) {
    const key = egressKey(row.date ? row.date.toISOString().slice(0, 10) : "", row.clientCode, egressOperationOf(row.operation), num(row.quantity));
    haveEgress.set(key, (haveEgress.get(key) ?? 0) + 1);
  }
  const freshEgress: EgressItem[] = [];
  for (const item of egressItems) {
    const key = egressKey(item.date, item.clientCode, item.operation, item.quantity);
    const remaining = haveEgress.get(key) ?? 0;
    if (remaining > 0) haveEgress.set(key, remaining - 1);
    else freshEgress.push(item);
  }
  const extraEgress = [...haveEgress.entries()].filter(([, count]) => count > 0);
  const byMonth: Record<string, number> = {};
  for (const item of freshEgress) byMonth[item.date.slice(0, 7)] = (byMonth[item.date.slice(0, 7)] ?? 0) + 1;
  console.log(
    `EGRESOS: planilla ${egressItems.length} (fecha inválida ${invalidEgress}; pasajes salteados ${skippedPasajes}) | base ${existingEgress.length} | nuevos ${freshEgress.length} por mes ${JSON.stringify(byMonth)} | ` +
    `en la base y no en la planilla ${extraEgress.reduce((sum, [, count]) => sum + count, 0)}`,
  );
  for (const [key, count] of extraEgress.slice(0, 30)) console.log(`  solo en la base: ${key} x${count}`);
  for (const item of freshEgress.filter((row) => row.date < "2026-06-29").slice(0, 30)) {
    console.log(`  nuevo anterior al 29/06/2026: ${item.date} ${item.clientCode} ${item.operation} x${item.quantity} (fila ${item.sheetRow})`);
  }

  // ---------- 2. Ingresos de la planilla por código
  const incomeSheet = readMatrix(workbook, "IngresosPampa", "Cliente");
  const i = { code: incomeSheet.col("Código Cliente"), operation: incomeSheet.col("Operación"), delivered: incomeSheet.col("Entregado") };
  const countedIncome = stockIncomeOperations(CLIENT);
  const planillaIncome = new Map<string, { clientCode: string; delivered: number }>();
  for (const row of incomeSheet.rows) {
    const clientCode = text(row[i.code]);
    if (!clientCode || !countedIncome.has(stockOperation(row[i.operation]))) continue;
    const current = planillaIncome.get(norm(clientCode)) ?? { clientCode, delivered: 0 };
    current.delivered += num(row[i.delivered]);
    planillaIncome.set(norm(clientCode), current);
  }

  // ---------- 3. Códigos: a quién se asignan hoy los ingresos de cada código
  const allCodes = new Set<string>([...planillaIncome.keys(), ...egressItems.map((item) => norm(item.clientCode))]);
  const pampaCodes = await excelPostgres.excelClientCode.findMany({ where: { client: { equals: CLIENT, mode: "insensitive" } }, select: { clientCode: true } });
  for (const code of pampaCodes) allCodes.add(norm(code.clientCode));
  const [activeCodes, history] = await Promise.all([
    excelPostgres.excelClientCode.findMany({ where: { active: true }, select: { clientCode: true, client: true } }),
    excelPostgres.tangoClientCodeMap.findMany(),
  ]);
  const activeClient = new Map<string, string>();
  for (const row of activeCodes) if (!activeClient.has(norm(row.clientCode))) activeClient.set(norm(row.clientCode), text(row.client));
  const historyClient = new Map(history.map((row) => [norm(row.clientCode), text(row.client)]));
  const resolvedClient = (code: string) => activeClient.get(code) ?? historyClient.get(code) ?? null;
  const addHistory: string[] = [];
  const otherClient: string[] = [];
  for (const code of allCodes) {
    const client = resolvedClient(code);
    if (!client) addHistory.push(code);
    else if (norm(client) !== norm(CLIENT)) otherClient.push(`${code} (${client})`);
  }
  console.log(`CÓDIGOS: ${allCodes.size} de Pampa | sin asignar (se agregan a la referencia histórica) ${addHistory.length} | asignados a otro cliente (no se tocan) ${otherClient.length}`);
  if (otherClient.length) console.log(`  ${otherClient.join(", ")}`);

  // ---------- 4. Ingresos de la plataforma por código (los que quedan asignados a Pampa)
  const willBePampa = new Set([...allCodes].filter((code) => !resolvedClient(code) || norm(resolvedClient(code)) === norm(CLIENT)));
  const tangoRows = await excelPostgres.tangoIncome.findMany({ select: { clientCode: true, operation: true, deliveredQuantity: true } });
  const platformIncome = new Map<string, number>();
  for (const row of tangoRows) {
    const code = norm(row.clientCode);
    if (!willBePampa.has(code) || !countedIncome.has(stockOperation(row.operation))) continue;
    platformIncome.set(code, (platformIncome.get(code) ?? 0) + num(row.deliveredQuantity));
  }
  const adjustments: Array<{ clientCode: string; difference: number; planilla: number; platform: number }> = [];
  for (const code of willBePampa) {
    const planilla = planillaIncome.get(code)?.delivered ?? 0;
    const platform = platformIncome.get(code) ?? 0;
    const difference = Math.round((planilla - platform) * 10000) / 10000;
    if (difference !== 0) adjustments.push({ clientCode: planillaIncome.get(code)?.clientCode ?? code.toUpperCase(), difference, planilla, platform });
  }
  const plus = adjustments.filter((row) => row.difference > 0).reduce((sum, row) => sum + row.difference, 0);
  const minus = adjustments.filter((row) => row.difference < 0).reduce((sum, row) => sum + row.difference, 0);
  console.log(`INGRESOS: ajustes ${adjustments.length} códigos (suman ${plus}, restan ${minus}, neto ${plus + minus}) con fecha ${adjustmentDate}`);
  for (const row of [...adjustments].sort((a, b) => a.difference - b.difference).filter((row) => row.difference < 0).slice(0, 40)) {
    console.log(`  resta ${row.clientCode}: planilla ${row.planilla}, plataforma ${row.platform}`);
  }

  // ---------- Stock resultante (ingresos de la planilla menos egresos que quedarían en la base)
  const egressAfter = new Map<string, number>();
  const allEgress = [
    ...existingEgress.map((row) => ({ clientCode: row.clientCode, operation: egressOperationOf(row.operation), quantity: num(row.quantity) })),
    ...freshEgress,
  ];
  for (const row of allEgress) {
    if (!STOCK_EGRESS_OPERATIONS.has(stockOperation(row.operation))) continue;
    egressAfter.set(norm(row.clientCode), (egressAfter.get(norm(row.clientCode)) ?? 0) + row.quantity);
  }
  const egressPlanilla = new Map<string, number>();
  for (const row of egressItems) {
    if (!STOCK_EGRESS_OPERATIONS.has(stockOperation(row.operation))) continue;
    egressPlanilla.set(norm(row.clientCode), (egressPlanilla.get(norm(row.clientCode)) ?? 0) + row.quantity);
  }
  const stockDiffs = [...willBePampa].filter((code) => (egressAfter.get(code) ?? 0) !== (egressPlanilla.get(code) ?? 0));
  console.log(`STOCK: códigos cuyo egreso en la base quedaría distinto al de la planilla: ${stockDiffs.length}`);
  for (const code of stockDiffs.slice(0, 30)) console.log(`  ${code}: base ${egressAfter.get(code) ?? 0}, planilla ${egressPlanilla.get(code) ?? 0}`);

  if (dryRun) {
    console.log("Dry run: no se escribió nada.");
    return;
  }

  const [codes, products] = await Promise.all([
    excelPostgres.excelClientCode.findMany({
      where: { client: { equals: CLIENT, mode: "insensitive" } },
      orderBy: [{ active: "desc" }, { assignmentYear: "desc" }, { assignmentMonth: "desc" }, { id: "desc" }],
    }),
    excelPostgres.excelProduct.findMany({ select: { uniqueCode: true, product: true } }),
  ]);
  const uniqueByCode = new Map<string, string>();
  for (const code of codes) if (!uniqueByCode.has(norm(code.clientCode))) uniqueByCode.set(norm(code.clientCode), norm(code.uniqueCode));
  const productByUnique = new Map(products.map((p) => [norm(p.uniqueCode), text(p.product)]));
  await excelPostgres.$transaction(
    async (tx) => {
      for (let offset = 0; offset < freshEgress.length; offset += 1000) {
        await tx.egress.createMany({
          data: freshEgress.slice(offset, offset + 1000).map((item) => {
            const unique = item.unique || uniqueByCode.get(norm(item.clientCode)) || "";
            return {
              client: CLIENT,
              operation: item.operation,
              date: new Date(`${item.date}T00:00:00.000Z`),
              clientCode: item.clientCode,
              uniqueCode: unique || null,
              product: productByUnique.get(unique) || item.product || null,
              quantity: item.quantity,
              destination: item.destination || null,
              comments: item.comments || null,
              createdBy: AUTHOR,
            };
          }),
        });
      }
      if (addHistory.length) {
        await tx.tangoClientCodeMap.createMany({ data: addHistory.map((code) => ({ clientCode: code.toUpperCase(), client: CLIENT })) });
      }
      if (adjustments.length) {
        const date = new Date(`${adjustmentDate}T00:00:00.000Z`);
        await tx.tangoIncome.createMany({
          data: adjustments.map((row) => ({
            client: CLIENT,
            operation: "ROBO/AJUSTE",
            orderDate: date,
            clientCode: row.clientCode,
            quantity: row.difference,
            deliveryDate: date,
            deliveredQuantity: row.difference,
            comments: `Ajuste para igualar el ingreso a la planilla 4- Stock Pampa (planilla ${row.planilla}, plataforma ${row.platform})`,
            pendingTangoEntry: true,
            createdBy: AUTHOR,
          })),
        });
      }
    },
    { timeout: 600_000 },
  );
  console.log(`OK. Egresos cargados ${freshEgress.length}, códigos agregados a la referencia histórica ${addHistory.length}, ajustes de ingreso ${adjustments.length}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
