import * as XLSX from "xlsx";
import fs from "node:fs";
import { excelPostgres } from "@/lib/excel-postgres-client-core";
import { stockIncomeOperations, stockOperation, STOCK_EGRESS_OPERATIONS } from "@/lib/stock-operations";

// Uso: tsx scripts/import-stock-planilla-cliente.ts <pampa|credicoop|amex> "<4- Stock X.xlsm>" [--fecha=AAAA-MM-DD]
//        [--sin-pasajes-del=AAAA-MM-DD] [--reemplazar-egresos] [--ingresos-por-fila] [--egresos-extra=<archivo.xlsx>]
//        [--dry-run]
// Deja el stock de un cliente en la plataforma igual al de su planilla de stock:
// 1. Egresos: carga las filas de la hoja de egresos que todavía no están en la base (cruce por fecha +
//    código cliente + operación + cantidad, respetando repeticiones). Las de la base que no están en la
//    planilla se informan y no se tocan. Con --reemplazar-egresos, en cambio, se dan de baja (deleted_at)
//    todos los egresos del cliente y se carga la hoja entera (para egresos migrados con el código mal).
//    Con --sin-pasajes-del no se cargan los PASAJE de ese día: son de una solicitud de pasaje que se carga
//    en la plataforma (Pasajes), que descuenta el origen al confirmarse.
//    Con --egresos-extra se suman las filas de otra base de egresos del cliente, más nueva que la planilla,
//    que no estén en la hoja (mismo cruce). Los datos personales de las filas (nombre, dirección, email) no se cargan.
// 2. Códigos: los códigos del cliente que no tienen asignación vigente ni referencia histórica se agregan
//    a tango_client_code_map, así los ingresos de códigos viejos (no vigentes) se le asignan al cliente.
// 3. Ingresos: con --ingresos-por-fila se carga cada fila de la hoja de ingresos (para clientes cuyos
//    ingresos no están en Tango). Después, por cada código, si lo entregado que cuenta para el stock en la
//    plataforma no es igual a lo entregado en la planilla, agrega una fila ROBO/AJUSTE con la diferencia.
//    Todo pendiente de Tango (si no, la sincronización con Tango frena por ingresos sin ID de Tango).
// Egresos e ingresos quedan con created_by (o deleted_by) "migracion-excel-<cliente>"; los códigos agregados
// a tango_client_code_map se reconocen por su created_at.
type Planilla = {
  client: string;
  egressSheet: string;
  incomeSheet: string;
  egress: { code: string; product: string; unique: string; comments?: string };
};
const PLANILLAS: Record<string, Planilla> = {
  pampa: {
    client: "Pampa",
    egressSheet: "EgresosPampa",
    incomeSheet: "IngresosPampa",
    egress: { code: "Código Cliente", product: "DB_Producto.Producto", unique: "Código Único", comments: "Comentarios" },
  },
  // En la hoja de Credicoop el código cliente es IdRecompensa (IdRedencion es el número de canje).
  credicoop: {
    client: "Credicoop",
    egressSheet: "ACT- EGRESOS (nv)",
    incomeSheet: "ACT- INGRESOS (nv)",
    egress: { code: "IdRecompensa", product: "Descripcion", unique: "DB_Clientes 1.Código Único" },
  },
  amex: {
    client: "Amex",
    egressSheet: "EgresosAmex",
    incomeSheet: "IngresosAmex",
    egress: { code: "Codigo cliente", product: "Producto", unique: "Código Único", comments: "Comentarios" },
  },
};
const planilla = PLANILLAS[String(process.argv[2] ?? "").toLowerCase()];
const filePath = process.argv[3];
const dryRun = process.argv.includes("--dry-run");
const replaceEgress = process.argv.includes("--reemplazar-egresos");
const incomeByRow = process.argv.includes("--ingresos-por-fila");
const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
const adjustmentDate = arg("fecha") ?? new Date().toISOString().slice(0, 10);
const skipPasajesOf = arg("sin-pasajes-del");
const extraEgressFile = arg("egresos-extra");
if (!planilla || !filePath) {
  console.error(`Uso: tsx scripts/import-stock-planilla-cliente.ts <${Object.keys(PLANILLAS).join("|")}> "<archivo.xlsm>" [--fecha=AAAA-MM-DD] [--sin-pasajes-del=AAAA-MM-DD] [--reemplazar-egresos] [--ingresos-por-fila] [--dry-run]`);
  process.exit(1);
}
const CLIENT = planilla.client;
const AUTHOR = `migracion-excel-${CLIENT.toLowerCase()}`;
const text = (value: unknown) => String(value ?? "").trim();
const norm = (value: unknown) => text(value).toLowerCase();
const num = (value: unknown) => {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const pad = (n: number) => String(n).padStart(2, "0");
// Algunas filas traen el año negativo (-2025), con dos dígitos (8 = 2008) o sin un dígito (226 = 2026).
const yearOf = (value: unknown) => {
  const year = Math.abs(num(value));
  if (year >= 200 && year < 300) return 2000 + (year % 100);
  return year > 0 && year < 100 ? 2000 + year : year;
};
const dateOf = (day: unknown, month: unknown, year: unknown) => {
  const d = num(day), m = num(month), y = yearOf(year);
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};
const toDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);
// Los egresos importados guardan ROBO_AJUSTE; el resto de los nombres coincide con la planilla.
const egressOperationOf = (value: unknown) => {
  const raw = text(value).toUpperCase().replace(/\s+/g, "_");
  // HISTORIA CANJE / HISTORIA OTRO son canjes viejos que la planilla guarda pero no descuenta del stock.
  if (raw.startsWith("HISTORIA")) return raw.replace(/_/g, " ");
  if (raw.includes("PASAJE")) return "PASAJE";
  if (raw.includes("ROBO") || raw.includes("AJUSTE")) return "ROBO_AJUSTE";
  if (raw.includes("CAMBIO")) return "CAMBIO";
  if (raw.includes("REENVIO")) return "REENVIO";
  return "CANJE";
};

function readMatrix(workbook: XLSX.WorkBook, sheet: string, firstHeader: string) {
  if (!workbook.Sheets[sheet]) throw new Error(`No encontré la hoja ${sheet}.`);
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
  const egressSheet = readMatrix(workbook, planilla.egressSheet, "Día");
  const e = {
    day: egressSheet.col("Día"), month: egressSheet.col("Mes"), year: egressSheet.col("Año"), code: egressSheet.col(planilla.egress.code),
    quantity: egressSheet.col("Cantidad"), operation: egressSheet.col("Operación"), destination: egressSheet.col("Destino"),
    comments: planilla.egress.comments ? egressSheet.col(planilla.egress.comments) : -1, unique: egressSheet.col(planilla.egress.unique),
    product: egressSheet.col(planilla.egress.product), description: egressSheet.col("Descripcion"),
  };
  type EgressItem = { date: string; clientCode: string; operation: string; quantity: number; product: string; destination: string; comments: string; unique: string; sheetRow: number };
  const egressItems: EgressItem[] = [];
  let invalidEgress = 0;
  let withoutCode = 0;
  let skippedPasajes = 0;
  egressSheet.rows.forEach((row, i) => {
    const clientCode = text(row[e.code]);
    if (!clientCode) {
      if (row[e.day] !== "") withoutCode += 1;
      return;
    }
    const date = dateOf(row[e.day], row[e.month], row[e.year]);
    if (!date) {
      invalidEgress += 1;
      return;
    }
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
      comments: e.comments >= 0 ? text(row[e.comments]) : "",
      unique: norm(row[e.unique]),
      sheetRow: egressSheet.firstRow + i,
    });
  });
  // Filas de la base de egresos más nueva que no están en la hoja de la planilla.
  if (extraEgressFile) {
    const extraWorkbook = XLSX.read(fs.readFileSync(extraEgressFile), { type: "buffer" });
    const extraSheet = readMatrix(extraWorkbook, extraWorkbook.SheetNames[0], "Día");
    const x = {
      day: extraSheet.col("Día"), month: extraSheet.col("Mes"), year: extraSheet.col("Año"), code: extraSheet.col(planilla.egress.code),
      quantity: extraSheet.col("Cantidad"), operation: extraSheet.col("Operación"), destination: extraSheet.col("Destino"),
      comments: extraSheet.col("Comentarios"), description: extraSheet.col("Descripcion"),
    };
    const inSheet = new Map<string, number>();
    const rowKey = (date: string, code: unknown, operation: string, quantity: number) => `${date}|${norm(code)}|${operation}|${quantity}`;
    for (const item of egressItems) {
      const key = rowKey(item.date, item.clientCode, item.operation, item.quantity);
      inSheet.set(key, (inSheet.get(key) ?? 0) + 1);
    }
    const added: Record<string, number> = {};
    extraSheet.rows.forEach((row, index) => {
      const clientCode = text(row[x.code]);
      const date = dateOf(row[x.day], row[x.month], row[x.year]);
      if (!clientCode || !date) return;
      const operation = egressOperationOf(row[x.operation]);
      const quantity = num(row[x.quantity]);
      const key = rowKey(date, clientCode, operation, quantity);
      const remaining = inSheet.get(key) ?? 0;
      if (remaining > 0) {
        inSheet.set(key, remaining - 1);
        return;
      }
      added[`${date.slice(0, 7)} ${operation}`] = (added[`${date.slice(0, 7)} ${operation}`] ?? 0) + 1;
      egressItems.push({
        date, clientCode, operation, quantity,
        product: text(row[x.description]),
        destination: text(row[x.destination]),
        comments: text(row[x.comments]),
        unique: "",
        sheetRow: extraSheet.firstRow + index,
      });
    });
    const missing = [...inSheet.values()].reduce((sum, count) => sum + count, 0);
    console.log(`EGRESOS EXTRA: agregadas ${JSON.stringify(added)} | de la hoja que no están en la base extra: ${missing}`);
  }
  const existingEgress = await excelPostgres.egress.findMany({
    where: { client: { equals: CLIENT, mode: "insensitive" }, deletedAt: null },
    select: { id: true, date: true, clientCode: true, operation: true, quantity: true },
  });
  const egressKey = (date: string, code: unknown, operation: string, quantity: number) => `${date}|${norm(code)}|${operation}|${quantity}`;
  const haveEgress = new Map<string, number>();
  for (const row of replaceEgress ? [] : existingEgress) {
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
  const byYear: Record<string, number> = {};
  for (const item of freshEgress) byYear[item.date.slice(0, 4)] = (byYear[item.date.slice(0, 4)] ?? 0) + 1;
  console.log(
    `EGRESOS: planilla ${egressItems.length} (sin código ${withoutCode}; fecha inválida ${invalidEgress}; pasajes salteados ${skippedPasajes}) | ` +
    `base ${existingEgress.length}${replaceEgress ? " (se dan de baja todos)" : ""} | a cargar ${freshEgress.length} por año ${JSON.stringify(byYear)}` +
    (replaceEgress ? "" : ` | en la base y no en la planilla ${extraEgress.reduce((sum, [, count]) => sum + count, 0)}`),
  );
  for (const [key, count] of extraEgress.slice(0, 30)) console.log(`  solo en la base: ${key} x${count}`);

  // ---------- 2. Ingresos de la planilla
  const incomeSheet = readMatrix(workbook, planilla.incomeSheet, "Cliente");
  const i = {
    operation: incomeSheet.col("Operación"), orderDay: incomeSheet.col("Día pedido"), orderMonth: incomeSheet.col("Mes pedido"),
    orderYear: incomeSheet.col("Año pedido"), order: incomeSheet.col("Orden de compra"), code: incomeSheet.col("Código Cliente"),
    quantity: incomeSheet.col("Cantidad"), origin: incomeSheet.col("Origen del pasaje"), deliveryDay: incomeSheet.col("Día entrega"),
    deliveryMonth: incomeSheet.col("Mes entrega"), deliveryYear: incomeSheet.col("Año entrega"), delivered: incomeSheet.col("Entregado"),
    comments: incomeSheet.col("Comentarios"),
  };
  const incomeRows = incomeSheet.rows
    .filter((row) => text(row[i.code]))
    .map((row) => ({
      operation: text(row[i.operation]).toUpperCase(),
      orderDate: dateOf(row[i.orderDay], row[i.orderMonth], row[i.orderYear]),
      purchaseOrder: text(row[i.order]),
      clientCode: text(row[i.code]),
      quantity: num(row[i.quantity]),
      origin: text(row[i.origin]),
      deliveryDate: dateOf(row[i.deliveryDay], row[i.deliveryMonth], row[i.deliveryYear]),
      delivered: num(row[i.delivered]),
      comments: text(row[i.comments]),
    }));
  const countedIncome = stockIncomeOperations(CLIENT);
  const planillaIncome = new Map<string, { clientCode: string; delivered: number }>();
  for (const row of incomeRows) {
    if (!countedIncome.has(stockOperation(row.operation))) continue;
    const current = planillaIncome.get(norm(row.clientCode)) ?? { clientCode: row.clientCode, delivered: 0 };
    current.delivered += row.delivered;
    planillaIncome.set(norm(row.clientCode), current);
  }
  if (incomeByRow) console.log(`INGRESOS POR FILA: ${incomeRows.length} filas de la planilla a cargar`);

  // ---------- 3. Códigos: a quién se asignan hoy los ingresos de cada código
  const allCodes = new Set<string>([...planillaIncome.keys(), ...egressItems.map((item) => norm(item.clientCode))]);
  const clientCodes = await excelPostgres.excelClientCode.findMany({ where: { client: { equals: CLIENT, mode: "insensitive" } }, select: { clientCode: true } });
  for (const code of clientCodes) allCodes.add(norm(code.clientCode));
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
  console.log(`CÓDIGOS: ${allCodes.size} de ${CLIENT} | sin asignar (se agregan a la referencia histórica) ${addHistory.length} | asignados a otro cliente (no se tocan) ${otherClient.length}`);
  if (otherClient.length) console.log(`  ${otherClient.slice(0, 60).join(", ")}`);

  // ---------- 4. Ingresos de la plataforma por código (los que quedan asignados al cliente)
  const ownCodes = new Set([...allCodes].filter((code) => !resolvedClient(code) || norm(resolvedClient(code)) === norm(CLIENT)));
  const tangoRows = await excelPostgres.tangoIncome.findMany({ select: { clientCode: true, operation: true, deliveredQuantity: true } });
  const platformIncome = new Map<string, number>();
  const addIncome = (clientCode: unknown, operation: unknown, delivered: number) => {
    const code = norm(clientCode);
    if (!ownCodes.has(code) || !countedIncome.has(stockOperation(operation))) return;
    platformIncome.set(code, (platformIncome.get(code) ?? 0) + delivered);
  };
  for (const row of tangoRows) addIncome(row.clientCode, row.operation, num(row.deliveredQuantity));
  if (incomeByRow) for (const row of incomeRows) addIncome(row.clientCode, row.operation, row.delivered);
  const adjustments: Array<{ clientCode: string; difference: number; planilla: number; platform: number }> = [];
  for (const code of ownCodes) {
    const planillaDelivered = planillaIncome.get(code)?.delivered ?? 0;
    const platform = platformIncome.get(code) ?? 0;
    const difference = Math.round((planillaDelivered - platform) * 10000) / 10000;
    if (difference !== 0) adjustments.push({ clientCode: planillaIncome.get(code)?.clientCode ?? code.toUpperCase(), difference, planilla: planillaDelivered, platform });
  }
  const plus = adjustments.filter((row) => row.difference > 0).reduce((sum, row) => sum + row.difference, 0);
  const minus = adjustments.filter((row) => row.difference < 0).reduce((sum, row) => sum + row.difference, 0);
  console.log(`INGRESOS: ajustes ${adjustments.length} códigos (suman ${plus}, restan ${minus}, neto ${plus + minus}) con fecha ${adjustmentDate}`);
  for (const row of [...adjustments].sort((a, b) => a.difference - b.difference).filter((row) => row.difference < 0).slice(0, 40)) {
    console.log(`  resta ${row.clientCode}: planilla ${row.planilla}, plataforma ${row.platform}`);
  }

  // ---------- Stock resultante (egresos que quedarían en la base contra los de la planilla)
  const egressAfter = new Map<string, number>();
  const allEgress = [
    ...(replaceEgress ? [] : existingEgress.map((row) => ({ clientCode: row.clientCode, operation: egressOperationOf(row.operation), quantity: num(row.quantity) }))),
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
  const stockDiffs = [...ownCodes].filter((code) => (egressAfter.get(code) ?? 0) !== (egressPlanilla.get(code) ?? 0));
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
      if (replaceEgress && existingEgress.length) {
        await tx.egress.updateMany({
          where: { client: { equals: CLIENT, mode: "insensitive" }, deletedAt: null },
          data: { deletedAt: new Date(), deletedBy: AUTHOR },
        });
      }
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
      if (incomeByRow) {
        for (let offset = 0; offset < incomeRows.length; offset += 1000) {
          await tx.tangoIncome.createMany({
            data: incomeRows.slice(offset, offset + 1000).map((row) => ({
              client: CLIENT,
              operation: row.operation,
              orderDate: toDate(row.orderDate),
              purchaseOrder: row.purchaseOrder || null,
              clientCode: row.clientCode,
              quantity: row.quantity,
              transferOrigin: row.origin || null,
              deliveryDate: toDate(row.deliveryDate),
              deliveredQuantity: row.delivered,
              comments: row.comments || null,
              pendingTangoEntry: true,
              createdBy: AUTHOR,
            })),
          });
        }
      }
      if (adjustments.length) {
        const date = toDate(adjustmentDate);
        await tx.tangoIncome.createMany({
          data: adjustments.map((row) => ({
            client: CLIENT,
            operation: "ROBO/AJUSTE",
            orderDate: date,
            clientCode: row.clientCode,
            quantity: row.difference,
            deliveryDate: date,
            deliveredQuantity: row.difference,
            comments: `Ajuste para igualar el ingreso a la planilla de stock de ${CLIENT} (planilla ${row.planilla}, plataforma ${row.platform})`,
            pendingTangoEntry: true,
            createdBy: AUTHOR,
          })),
        });
      }
    },
    { timeout: 900_000 },
  );
  console.log(
    `OK. Egresos dados de baja ${replaceEgress ? existingEgress.length : 0}, egresos cargados ${freshEgress.length}, ` +
    `códigos agregados a la referencia histórica ${addHistory.length}, ingresos por fila ${incomeByRow ? incomeRows.length : 0}, ajustes de ingreso ${adjustments.length}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
