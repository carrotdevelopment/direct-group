import "server-only";

import * as XLSX from "xlsx";
import { Prisma } from "../node_modules/.prisma/excel-client";
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

async function loadTangoClientResolution() {
  const [mappings, clientCodeMap] = await Promise.all([
    excelPostgres.excelClientCode.findMany({
      where: { active: true },
      orderBy: [{ assignmentYear: "desc" }, { assignmentMonth: "desc" }, { id: "desc" }],
    }),
    excelPostgres.tangoClientCodeMap.findMany(),
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
  // Referencia histórica (2012-2026) relevada de la planilla que se usaba
  // antes de esta plataforma: cubre códigos que ya no están "activos" en
  // Códigos Cliente pero sí tienen historial real de a qué cliente pertenecen.
  const historicalClientByCode = new Map<string, string>();
  for (const entry of clientCodeMap) {
    historicalClientByCode.set(normalizeSearch(entry.clientCode), text(entry.client));
  }
  return { byClientCode, historicalClientByCode };
}

// El "Cliente" de Tango (STA22.NOMBRE_SUC) es en realidad el depósito/campaña,
// no el cliente real de DG (confirmado con la base: un mismo depósito como
// "Urbano Express" mezcla códigos de decenas de clientes distintos). Prioridad:
// 1) referencia histórica por código (más cobertura, 2012-2026), 2) Códigos
// Cliente activos, 3) el texto de Tango como último recurso.
function resolveTangoClient(
  codeKey: string,
  rawClient: unknown,
  resolution: Awaited<ReturnType<typeof loadTangoClientResolution>>,
) {
  return (
    resolution.historicalClientByCode.get(codeKey) ||
    resolution.byClientCode.get(codeKey)?.client ||
    text(rawClient) ||
    "Sin cliente"
  );
}

const ACCENTS_FROM = "áàäâéèëêíìïîóòöôúùüûñç";
const ACCENTS_TO = "aaaaeeeeiiiioooouuuunc";

// Equivalente en SQL de normalizeSearch(): minúsculas, sin acentos, sin espacios al borde.
function norm(expression: string) {
  return `translate(lower(btrim(coalesce(${expression}, ''))), '${ACCENTS_FROM}', '${ACCENTS_TO}')`;
}

// Resuelve el cliente real de cada ingreso en la base (misma prioridad que
// resolveTangoClient: referencia histórica, Códigos Cliente activos, texto de Tango).
const RESOLVED_INCOME_CTE = Prisma.raw(`
  act AS (
    SELECT DISTINCT ON (${norm("codigo_cliente")})
      ${norm("codigo_cliente")} AS k, btrim(coalesce(cliente, '')) AS cliente, btrim(coalesce(codigo_unico, '')) AS codigo_unico
    FROM base_codigo_cliente
    WHERE activo = true
    ORDER BY ${norm("codigo_cliente")}, anio_asignacion DESC, mes_asignacion DESC, id DESC
  ),
  hist AS (
    SELECT DISTINCT ON (${norm("client_code")})
      ${norm("client_code")} AS k, btrim(coalesce(client, '')) AS client
    FROM tango_client_code_map
    ORDER BY ${norm("client_code")}, id DESC
  ),
  r AS (
    SELECT t.id, btrim(coalesce(t.operacion, '')) AS operacion, t.fecha_pedido, btrim(coalesce(t.orden_de_compra, '')) AS orden_de_compra,
      btrim(coalesce(t.codigo_cliente, '')) AS codigo_cliente, coalesce(t.cantidad, 0) AS cantidad,
      btrim(coalesce(t.origen_del_pasaje, '')) AS origen, t.fecha_entrega, coalesce(t.entregado, 0) AS entregado,
      btrim(coalesce(t.comentarios, '')) AS comentarios, t.pending_tango_entry, t.created_by, t.updated_at,
      coalesce(nullif(hist.client, ''), nullif(act.cliente, ''), nullif(btrim(coalesce(t.cliente, '')), ''), 'Sin cliente') AS cliente_res,
      coalesce(act.codigo_unico, '') AS codigo_unico,
      greatest(0, coalesce(t.cantidad, 0) - coalesce(t.entregado, 0)) AS pendiente
    FROM tango_ingresos t
    LEFT JOIN hist ON hist.k = ${norm("t.codigo_cliente")}
    LEFT JOIN act ON act.k = ${norm("t.codigo_cliente")}
  )
`);

type IncomeDbRow = {
  id: bigint;
  cliente_res: string;
  operacion: string;
  fecha_display: string | null;
  anio: number | null;
  mes: number | null;
  orden_de_compra: string;
  codigo_cliente: string;
  codigo_unico: string;
  cantidad: number;
  origen: string;
  entrega_display: string | null;
  entregado: number;
  pendiente: number;
  comentarios: string;
  pending_tango_entry: boolean;
  created_by: string | null;
};

type IncomeAggregate = {
  total: number;
  cantidad: number | null;
  entregado: number | null;
  pendiente: number | null;
  filas_pendientes: number;
  sin_unico: number;
};

function aggregateToSummary(row: IncomeAggregate | undefined): TangoIncomeViewSummary {
  return {
    totalRows: Number(row?.total ?? 0),
    totalQuantity: Number(row?.cantidad ?? 0),
    totalDelivered: Number(row?.entregado ?? 0),
    pendingQuantity: Number(row?.pendiente ?? 0),
    pendingRows: Number(row?.filas_pendientes ?? 0),
    unmatchedRows: Number(row?.sin_unico ?? 0),
  };
}

function incomeConditions(options: TangoIncomeFilters) {
  const conditions: Prisma.Sql[] = [];
  const clients = (options.clients ?? []).map(normalizeSearch);
  if (clients.length) conditions.push(Prisma.sql`${Prisma.raw(norm("cliente_res"))} = ANY(${clients}::text[])`);
  if (options.operation) conditions.push(Prisma.sql`operacion = ${options.operation}`);
  if (options.years?.length) conditions.push(Prisma.sql`extract(year FROM fecha_pedido)::int = ANY(${options.years}::int[])`);
  if (options.months?.length) conditions.push(Prisma.sql`extract(month FROM fecha_pedido)::int = ANY(${options.months}::int[])`);
  if (options.status === "pending") conditions.push(Prisma.sql`pendiente > 0`);
  if (options.status === "complete") conditions.push(Prisma.sql`pendiente <= 0`);
  if (options.status === "without-order-date") conditions.push(Prisma.sql`(pendiente <= 0 AND fecha_pedido IS NULL)`);
  const query = normalizeSearch(options.search);
  if (query) {
    const haystack = norm(
      "concat_ws(E'\\x01', cliente_res, operacion, orden_de_compra, codigo_cliente, codigo_unico, origen, comentarios)",
    );
    conditions.push(Prisma.sql`strpos(${Prisma.raw(haystack)}, ${query}) > 0`);
  }
  return conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;
}

const AGGREGATE_COLUMNS = Prisma.raw(`
  count(*)::int AS total, sum(cantidad)::float8 AS cantidad, sum(entregado)::float8 AS entregado,
  sum(pendiente)::float8 AS pendiente, (count(*) FILTER (WHERE pendiente > 0))::int AS filas_pendientes,
  (count(*) FILTER (WHERE codigo_unico = ''))::int AS sin_unico
`);

// Todo el filtrado, orden y totales se resuelven en PostgreSQL: antes se traían
// las ~128 mil filas a memoria en cada consulta (cada filtro, cada carga de página).
export async function readTangoIncomeViewFromPostgres(options: TangoIncomeFilters = {}) {
  const where = incomeConditions(options);
  const limit = Math.max(1, Math.min(Number(options.limit ?? 750), 5000));

  const [rows, filteredAggregate, groups] = await Promise.all([
    excelPostgres.$queryRaw<IncomeDbRow[]>(Prisma.sql`
      WITH ${RESOLVED_INCOME_CTE}
      SELECT id, cliente_res, operacion, to_char(fecha_pedido, 'DD/MM/YYYY') AS fecha_display,
        extract(year FROM fecha_pedido)::int AS anio, extract(month FROM fecha_pedido)::int AS mes,
        orden_de_compra, codigo_cliente, codigo_unico, cantidad::float8 AS cantidad, origen,
        to_char(fecha_entrega, 'DD/MM/YYYY') AS entrega_display, entregado::float8 AS entregado,
        pendiente::float8 AS pendiente, comentarios, pending_tango_entry, created_by
      FROM r ${where}
      ORDER BY fecha_pedido DESC NULLS LAST, id DESC
      LIMIT ${limit}`),
    excelPostgres.$queryRaw<IncomeAggregate[]>(Prisma.sql`
      WITH ${RESOLVED_INCOME_CTE}
      SELECT ${AGGREGATE_COLUMNS} FROM r ${where}`),
    excelPostgres.$queryRaw<
      (IncomeAggregate & { cliente_res: string; operacion: string; anio: number | null; origen: string; ultima: Date | null })[]
    >(Prisma.sql`
      WITH ${RESOLVED_INCOME_CTE}
      SELECT cliente_res, operacion, extract(year FROM fecha_pedido)::int AS anio, origen,
        max(updated_at) AS ultima, ${AGGREGATE_COLUMNS}
      FROM r GROUP BY 1, 2, 3, 4`),
  ]);

  const totals = aggregateToSummary({
    total: groups.reduce((sum, g) => sum + Number(g.total), 0),
    cantidad: groups.reduce((sum, g) => sum + Number(g.cantidad ?? 0), 0),
    entregado: groups.reduce((sum, g) => sum + Number(g.entregado ?? 0), 0),
    pendiente: groups.reduce((sum, g) => sum + Number(g.pendiente ?? 0), 0),
    filas_pendientes: groups.reduce((sum, g) => sum + Number(g.filas_pendientes), 0),
    sin_unico: groups.reduce((sum, g) => sum + Number(g.sin_unico), 0),
  });
  const lastUpdated = groups.reduce<Date | null>(
    (latest, g) => (g.ultima && (!latest || g.ultima > latest) ? g.ultima : latest),
    null,
  );

  const summary: TangoIncomeSummary = {
    exists: true,
    filePath: "PostgreSQL / tango_ingresos",
    lastUpdated: lastUpdated?.toISOString() ?? null,
    totalRows: totals.totalRows,
    clients: new Set(groups.map((g) => normalizeSearch(g.cliente_res))).size,
    operations: new Set(groups.map((g) => normalizeSearch(g.operacion))).size,
    totalQuantity: totals.totalQuantity,
    totalDelivered: totals.totalDelivered,
    pendingQuantity: totals.pendingQuantity,
    pendingRows: totals.pendingRows,
  };

  const mappedRows: TangoIncomeRow[] = rows.map((row) => {
    const status = row.pendiente > 0 ? "pending" : !row.fecha_display ? "without-order-date" : "complete";
    return {
      id: row.id.toString(),
      rowIndex: Number(row.id),
      client: row.cliente_res,
      operation: row.operacion,
      orderDate: row.fecha_display ?? "",
      orderYear: row.anio,
      orderMonth: row.mes,
      orderNumber: row.orden_de_compra,
      clientCode: row.codigo_cliente,
      uniqueCode: row.codigo_unico,
      quantity: row.cantidad,
      source: row.origen,
      deliveryDate: row.entrega_display ?? "",
      delivered: row.entregado,
      pending: row.pendiente,
      comments: row.comentarios,
      status,
      pendingTangoEntry: row.pending_tango_entry,
      manualEntry: Boolean(row.created_by),
    };
  });

  return {
    rows: mappedRows,
    totalFiltered: Number(filteredAggregate[0]?.total ?? 0),
    viewSummary: aggregateToSummary(filteredAggregate[0]),
    summary,
    options: {
      clients: Array.from(new Set(groups.map((g) => g.cliente_res))).sort((a, b) => a.localeCompare(b)),
      operations: Array.from(new Set(groups.map((g) => g.operacion))).sort((a, b) => a.localeCompare(b)),
      years: Array.from(new Set(groups.map((g) => g.anio).filter((year): year is number => year !== null))).sort(
        (a, b) => b - a,
      ),
      origins: Array.from(new Set(groups.map((g) => g.origen).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es")),
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
  // El stock de Santander se calcula contra el Cliente ya resuelto (no el
  // depósito crudo de Tango), así que hay que traer todos los ingresos y
  // filtrar en JS con la misma prioridad que usa la página de Ingresos.
  const [incomeRows, resolution, egressGroups] = await Promise.all([
    excelPostgres.tangoIncome.findMany({
      select: {
        client: true,
        operation: true,
        clientCode: true,
        quantity: true,
        deliveredQuantity: true,
        deliveryDate: true,
      },
    }),
    loadTangoClientResolution(),
    excelPostgres.egress.groupBy({
      by: ["clientCode", "operation"],
      where: {
        client: { equals: "santander", mode: "insensitive" },
        deletedAt: null,
      },
      _sum: { quantity: true },
    }),
  ]);

  const santanderRows = incomeRows.filter((row) => {
    const codeKey = normalizeSearch(row.clientCode);
    return resolveTangoClient(codeKey, row.client, resolution).toLowerCase() === "santander";
  });

  const groups = new Map<
    string,
    { clientCode: string; operation: string; quantity: number; delivered: number }
  >();
  for (const row of santanderRows) {
    const clientCode = text(row.clientCode);
    const operationValue = text(row.operation);
    const key = `${normalizeSearch(clientCode)}::${normalizeSearch(operationValue)}`;
    const current = groups.get(key) ?? { clientCode, operation: operationValue, quantity: 0, delivered: 0 };
    current.quantity += number(row.quantity);
    current.delivered += number(row.deliveredQuantity);
    groups.set(key, current);
  }
  const incomes: Array<Record<string, unknown>> = Array.from(groups.values()).map((group) => ({
    "Código Cliente": group.clientCode,
    Operación: group.operation,
    Cantidad: group.quantity,
    Entregado: group.delivered,
  }));

  const earliestByCode = new Map<string, { clientCode: string; deliveryDate: Date }>();
  for (const row of santanderRows) {
    const normalizedOperation = normalizeSearch(row.operation).toUpperCase();
    if (!['COMPRA', 'PASAJE'].includes(normalizedOperation)) continue;
    if (!row.deliveryDate) continue;
    const key = normalizeSearch(row.clientCode);
    const current = earliestByCode.get(key);
    if (!current || row.deliveryDate < current.deliveryDate) {
      earliestByCode.set(key, { clientCode: text(row.clientCode), deliveryDate: row.deliveryDate });
    }
  }
  for (const entry of earliestByCode.values()) {
    incomes.push({
      "Código Cliente": entry.clientCode,
      Operación: "COMPRA",
      Cantidad: 0,
      Entregado: 0,
      "Día entrega": entry.deliveryDate.getUTCDate(),
      "Mes entrega": entry.deliveryDate.getUTCMonth() + 1,
      "Año entrega": entry.deliveryDate.getUTCFullYear(),
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
