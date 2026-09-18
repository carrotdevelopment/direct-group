import "server-only";

import * as XLSX from "xlsx";
import { excelPostgres } from "@/lib/excel-postgres-client";
import {
  egressSchemas,
  incomeSchema,
  type EgressClient,
  type EgressRow,
  type TangoIncomeFilters,
  type TangoIncomeRow,
  type TangoIncomeSummary,
  type TangoIncomeViewSummary,
} from "@/lib/operation-excel-db";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: { toString(): string } | number | null | undefined) {
  if (value == null) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSearch(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function displayDate(value: Date | null) {
  if (!value) return "";
  return `${String(value.getUTCDate()).padStart(2, "0")}/${String(
    value.getUTCMonth() + 1,
  ).padStart(2, "0")}/${value.getUTCFullYear()}`;
}

function isoDateFromParts(day: number | null, month: number | null, year: number | null) {
  if (!day || !month || !year) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function tangoRows(): Promise<TangoIncomeRow[]> {
  const [rows, mappings] = await Promise.all([
    excelPostgres.tangoIncome.findMany({ orderBy: { id: "asc" } }),
    excelPostgres.excelClientCode.findMany({
      where: { active: true },
      orderBy: [{ assignmentYear: "desc" }, { assignmentMonth: "desc" }, { id: "desc" }],
    }),
  ]);
  const byClientCode = new Map<string, { client: string; uniqueCode: string }>();
  for (const mapping of mappings) {
    const key = normalizeSearch(mapping.clientCode);
    if (!byClientCode.has(key)) {
      byClientCode.set(key, {
        client: text(mapping.client),
        uniqueCode: text(mapping.uniqueCode),
      });
    }
  }
  return rows.map((row) => {
    const clientCode = text(row.clientCode);
    const mapping = byClientCode.get(normalizeSearch(clientCode));
    const quantity = number(row.quantity);
    const delivered = number(row.deliveredQuantity);
    const pending = Math.max(0, quantity - delivered);
    const orderDate = displayDate(row.orderDate);
    const status = pending > 0 ? "pending" : !orderDate ? "without-order-date" : "complete";
    return {
      id: row.id.toString(),
      rowIndex: Number(row.id),
      // El "Cliente" de Tango (STA22.NOMBRE_SUC) es en realidad el depósito/
      // campaña, no el cliente real de DG (confirmado con la base: un mismo
      // depósito como "Urbano Express" mezcla códigos de decenas de clientes
      // distintos). El mapeo por código cliente contra Códigos Cliente es la
      // fuente confiable; el texto de Tango queda solo como último recurso.
      client: mapping?.client || text(row.client) || "Sin cliente",
      operation: text(row.operation),
      orderDate,
      orderYear: row.orderDate?.getUTCFullYear() ?? null,
      orderMonth: row.orderDate ? row.orderDate.getUTCMonth() + 1 : null,
      orderNumber: text(row.purchaseOrder),
      clientCode,
      uniqueCode: mapping?.uniqueCode ?? "",
      quantity,
      source: text(row.transferOrigin),
      deliveryDate: displayDate(row.deliveryDate),
      delivered,
      pending,
      comments: text(row.comments),
      status,
      pendingTangoEntry: row.pendingTangoEntry,
    };
  });
}

export async function readTangoIncomeViewFromPostgres(options: TangoIncomeFilters = {}) {
  const allRows = await tangoRows();
  const query = normalizeSearch(options.search);
  const clientSet = new Set((options.clients ?? []).map(normalizeSearch));
  const yearSet = new Set(options.years ?? []);
  const monthSet = new Set(options.months ?? []);
  const filteredRows = allRows
    .filter((row) => {
      if (clientSet.size && !clientSet.has(normalizeSearch(row.client))) return false;
      if (options.operation && row.operation !== options.operation) return false;
      if (yearSet.size && !yearSet.has(row.orderYear ?? 0)) return false;
      if (monthSet.size && !monthSet.has(row.orderMonth ?? 0)) return false;
      if (options.status === "pending" && row.pending <= 0) return false;
      if (options.status === "complete" && row.pending > 0) return false;
      if (options.status === "without-order-date" && row.status !== "without-order-date") return false;
      if (!query) return true;
      return [row.client, row.operation, row.orderNumber, row.clientCode, row.uniqueCode, row.source, row.comments]
        .some((entry) => normalizeSearch(entry).includes(query));
    })
    .sort((left, right) => right.orderDate.localeCompare(left.orderDate) || right.rowIndex - left.rowIndex);

  const summarize = (source: TangoIncomeRow[]): TangoIncomeViewSummary => ({
    totalRows: source.length,
    totalQuantity: source.reduce((total, row) => total + row.quantity, 0),
    totalDelivered: source.reduce((total, row) => total + row.delivered, 0),
    pendingQuantity: source.reduce((total, row) => total + row.pending, 0),
    pendingRows: source.filter((row) => row.pending > 0).length,
    unmatchedRows: source.filter((row) => !row.uniqueCode).length,
  });
  const totalSummary = summarize(allRows);
  const lastUpdated = await excelPostgres.tangoIncome.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  const summary: TangoIncomeSummary = {
    exists: true,
    filePath: "PostgreSQL / tango_ingresos",
    lastUpdated: lastUpdated?.updatedAt.toISOString() ?? null,
    totalRows: totalSummary.totalRows,
    clients: new Set(allRows.map((row) => normalizeSearch(row.client))).size,
    operations: new Set(allRows.map((row) => normalizeSearch(row.operation))).size,
    totalQuantity: totalSummary.totalQuantity,
    totalDelivered: totalSummary.totalDelivered,
    pendingQuantity: totalSummary.pendingQuantity,
    pendingRows: totalSummary.pendingRows,
  };
  return {
    rows: filteredRows.slice(0, options.limit ?? 750),
    totalFiltered: filteredRows.length,
    viewSummary: summarize(filteredRows),
    summary,
    options: {
      clients: Array.from(new Set(allRows.map((row) => row.client))).sort((a, b) => a.localeCompare(b)),
      operations: Array.from(new Set(allRows.map((row) => row.operation))).sort((a, b) => a.localeCompare(b)),
      years: Array.from(new Set(allRows.map((row) => row.orderYear).filter((year): year is number => year !== null)))
        .sort((a, b) => b - a),
      origins: Array.from(new Set(allRows.map((row) => row.source).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es")),
    },
  };
}

export async function readIncomeRowsFromPostgres(options: {
  client?: string;
  month?: number;
  year?: number;
  limit?: number;
} = {}) {
  const rows = await excelPostgres.excelIncome.findMany({
    where: {
      client: options.client ? { equals: options.client, mode: "insensitive" } : undefined,
      orderMonth: options.month,
      orderYear: options.year,
    },
    orderBy: { id: "desc" },
    take: options.limit && Number.isSafeInteger(options.limit) ? options.limit : undefined,
  });
  return rows.map((row) => ({
    Cliente: text(row.client),
    Operación: text(row.operation),
    "Día pedido": row.orderDay ?? "",
    "Mes pedido": row.orderMonth ?? "",
    "Año pedido": row.orderYear ?? "",
    "Orden de compra": text(row.purchaseOrder),
    "Código Cliente": text(row.clientCode),
    Cantidad: number(row.quantity),
    "Origen del pasaje": text(row.transferOrigin),
    "Día entrega": row.deliveryDay ?? "",
    "Mes entrega": row.deliveryMonth ?? "",
    "Año entrega": row.deliveryYear ?? "",
    Entregado: number(row.deliveredQuantity),
    Comentarios: text(row.comments),
    __rowIndex: Number(row.id),
  }));
}

export async function readStockOperationRowsFromPostgres() {
  const [incomeGroups, incomeDates, egressGroups] = await Promise.all([
    excelPostgres.excelIncome.groupBy({
      by: ["clientCode", "operation"],
      where: { client: { equals: "santander", mode: "insensitive" } },
      _sum: { quantity: true, deliveredQuantity: true },
    }),
    excelPostgres.excelIncome.findMany({
      where: {
        client: { equals: "santander", mode: "insensitive" },
        deliveryDay: { not: null },
      },
      select: {
        clientCode: true,
        operation: true,
        deliveryDay: true,
        deliveryMonth: true,
        deliveryYear: true,
      },
    }),
    excelPostgres.egress.groupBy({
      by: ["clientCode", "operation"],
      where: {
        client: { equals: "santander", mode: "insensitive" },
        deletedAt: null,
      },
      _sum: { quantity: true },
    }),
  ]);

  const incomes: Array<Record<string, unknown>> = incomeGroups.map((row) => ({
    "Código Cliente": text(row.clientCode),
    Operación: text(row.operation),
    Cantidad: number(row._sum.quantity),
    Entregado: number(row._sum.deliveredQuantity),
  }));
  const earliestByCode = new Map<string, (typeof incomeDates)[number]>();
  for (const row of incomeDates) {
    const normalizedOperation = normalizeSearch(row.operation).toUpperCase();
    if (!['COMPRA', 'PASAJE'].includes(normalizedOperation)) continue;
    if (!row.deliveryDay || !row.deliveryMonth || !row.deliveryYear) continue;
    const key = normalizeSearch(row.clientCode);
    const current = earliestByCode.get(key);
    const timestamp = Date.UTC(row.deliveryYear, row.deliveryMonth - 1, row.deliveryDay);
    const currentTimestamp = current?.deliveryDay && current.deliveryMonth && current.deliveryYear
      ? Date.UTC(current.deliveryYear, current.deliveryMonth - 1, current.deliveryDay)
      : Number.POSITIVE_INFINITY;
    if (timestamp < currentTimestamp) earliestByCode.set(key, row);
  }
  for (const row of earliestByCode.values()) {
    incomes.push({
      "Código Cliente": text(row.clientCode),
      Operación: "COMPRA",
      Cantidad: 0,
      Entregado: 0,
      "Día entrega": row.deliveryDay,
      "Mes entrega": row.deliveryMonth,
      "Año entrega": row.deliveryYear,
    });
  }

  const egresses: Array<Record<string, unknown>> = egressGroups.map((row) => ({
    SKU: text(row.clientCode),
    Operación: text(row.operation),
    Cantidad: number(row._sum.quantity),
  }));
  return { incomes, egresses };
}

export async function readEgressRowsFromPostgres(options: {
  client?: EgressClient;
  from?: string;
  to?: string;
  limit?: number;
} = {}): Promise<EgressRow[]> {
  if (options.client && options.client !== "Santander") return [];
  const rows = await excelPostgres.excelSantanderEgress.findMany({
    where: {
      date: {
        gte: options.from ? new Date(`${options.from}T00:00:00.000Z`) : undefined,
        lte: options.to ? new Date(`${options.to}T23:59:59.999Z`) : undefined,
      },
    },
    orderBy: { id: "desc" },
    take:
      options.limit && Number.isSafeInteger(options.limit) && options.limit < 1_000_000
        ? options.limit
        : undefined,
  });
  return rows.map((row) => ({
    Dia: row.day ?? "", Mes: row.month ?? "", Año: row.year ?? "",
    "Nro guia": text(row.guideNumber), Fecha: row.date ? displayDate(row.date) : "",
    ID: text(row.legacyId), SKU: text(row.sku), Localidad: text(row.locality),
    Provincia: text(row.province), CP: text(row.postalCode),
    Cantidad: row.quantity == null ? text(row.quantityOriginal) : number(row.quantity),
    Operación: text(row.operation), Destino: text(row.destination), Comentario: text(row.comment),
    __rowIndex: Number(row.id), __client: "Santander", __date: row.date
      ? row.date.toISOString().slice(0, 10)
      : isoDateFromParts(row.day, row.month, row.year),
  }));
}

function getValue(row: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    if (Object.hasOwn(row, alias)) return row[alias];
  }
  const targets = new Set(aliases.map(normalizeSearch));
  return Object.entries(row).find(([key]) => targets.has(normalizeSearch(key)))?.[1];
}

function parsedNumber(value: unknown) {
  const parsed = Number(text(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parsedDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const [first, second, yearText] = raw.split(/[\/-]/).map(Number);
  if (first && second && yearText) {
    const year = yearText < 100 ? 2000 + yearText : yearText;
    const month = first <= 12 ? first : second;
    const day = first <= 12 ? second : first;
    return new Date(Date.UTC(year, month - 1, day));
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function appendSantanderEgressRecords(records: Record<string, unknown>[]) {
  const data = records.map((row) => ({
    day: parsedNumber(getValue(row, ["Dia", "Día"])),
    month: parsedNumber(getValue(row, ["Mes"])),
    year: parsedNumber(getValue(row, ["Año", "Anio"])),
    guideNumber: text(getValue(row, ["Nro guia"])),
    date: parsedDate(getValue(row, ["Fecha"])),
    legacyId: text(getValue(row, ["ID"])),
    sku: text(getValue(row, ["SKU"])),
    locality: text(getValue(row, ["Localidad"])),
    province: text(getValue(row, ["Provincia"])),
    postalCode: text(getValue(row, ["CP"])),
    quantity: parsedNumber(getValue(row, ["Cantidad"])),
    operation: text(getValue(row, ["Operación", "Operacion"])),
    destination: text(getValue(row, ["Destino"])),
    comment: text(getValue(row, ["Comentario", "Comentarios"])),
  })).filter((row) => Object.values(row).some((value) => value !== "" && value !== null));
  if (data.length) await excelPostgres.excelSantanderEgress.createMany({ data });
  return { insertedRows: data.length, totalRows: await excelPostgres.excelSantanderEgress.count() };
}

export function parseSantanderEgressWorkbook(buffer: Buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const expected = egressSchemas.Santander.map(normalizeSearch);
  const received = Object.keys(rows[0] ?? {}).map(normalizeSearch);
  const missing = expected.filter((header) => !received.includes(header));
  if (missing.length) {
    return { ok: false as const, message: "La estructura del archivo no coincide con Santander.", receivedHeaders: Object.keys(rows[0] ?? {}) };
  }
  return { ok: true as const, rows };
}

export async function updateSantanderEgress(id: number, values: Record<string, unknown>) {
  const existing = await excelPostgres.excelSantanderEgress.findUnique({ where: { id: BigInt(id) } });
  if (!existing) return false;
  const row = (await appendData(values));
  await excelPostgres.excelSantanderEgress.update({ where: { id: BigInt(id) }, data: row });
  return true;
}

async function appendData(row: Record<string, unknown>) {
  return {
    day: parsedNumber(getValue(row, ["Dia", "Día"])), month: parsedNumber(getValue(row, ["Mes"])),
    year: parsedNumber(getValue(row, ["Año", "Anio"])), guideNumber: text(getValue(row, ["Nro guia"])),
    date: parsedDate(getValue(row, ["Fecha"])), legacyId: text(getValue(row, ["ID"])),
    sku: text(getValue(row, ["SKU"])), locality: text(getValue(row, ["Localidad"])),
    province: text(getValue(row, ["Provincia"])), postalCode: text(getValue(row, ["CP"])),
    quantity: parsedNumber(getValue(row, ["Cantidad"])), operation: text(getValue(row, ["Operación", "Operacion"])),
    destination: text(getValue(row, ["Destino"])), comment: text(getValue(row, ["Comentario", "Comentarios"])),
  };
}

export async function deleteSantanderEgresses(ids: number[]) {
  const valid = ids.filter((id) => Number.isSafeInteger(id) && id > 0).map(BigInt);
  if (!valid.length) return 0;
  const result = await excelPostgres.excelSantanderEgress.deleteMany({ where: { id: { in: valid } } });
  return result.count;
}

export async function getEgressSummaryFromPostgres() {
  const santander = await excelPostgres.excelSantanderEgress.count();
  return (Object.keys(egressSchemas) as EgressClient[]).map((client) => ({
    client,
    columns: egressSchemas[client].length,
    rows: client === "Santander" ? santander : 0,
    exists: client === "Santander",
  }));
}

export { incomeSchema };
