import "server-only";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { fetchUrbanoApiMovements, fetchUrbanoApiProducts, urbanoApiConfig } from "@/lib/urbano-api";
import { urbanoApiMovementRows, urbanoApiStockRows, urbanoCodeFinder } from "@/lib/urbano-api-rows";
import { fetchUrbanoPortalStock } from "@/lib/urbano-portal";
import { parseUrbanoStockSheet, resolveUrbanoStock, type ResolvedUrbanoStockRow, type UrbanoStockRow } from "@/lib/urbano-stock";

export class UrbanoStockError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const MAX_ROWS = 5000;
const text = (value: unknown, max = 255) => String(value ?? "").trim().slice(0, max);
const validHash = (value: unknown) => (typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : null);
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function sanitizeRows(input: unknown): UrbanoStockRow[] {
  if (!Array.isArray(input) || input.length === 0) throw new UrbanoStockError("El reporte no tiene filas con códigos.");
  if (input.length > MAX_ROWS) throw new UrbanoStockError(`Se pueden cargar hasta ${MAX_ROWS} filas por reporte.`);
  return input.map((item, index) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      row: Number(row.row) || index + 1,
      clientCode: text(row.clientCode),
      product: text(row.product, 500),
      quantity: Number(row.quantity),
      unavailable: Number(row.unavailable ?? 0),
      pendingPickup: Number(row.pendingPickup ?? 0),
      company: text(row.company, 20),
    };
  }).filter((row) => row.clientCode);
}

function sanitizeDate(value: unknown) {
  const date = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new UrbanoStockError("Indicá la fecha del reporte.");
  return new Date(`${date}T00:00:00.000Z`);
}

async function clientCodes() {
  const codes = await excelPostgres.excelClientCode.findMany({ select: { client: true, clientCode: true, uniqueCode: true, active: true, voidedAt: true } });
  return codes
    .filter((code) => code.client && code.clientCode)
    .map((code) => ({
      client: String(code.client), clientCode: String(code.clientCode), uniqueCode: String(code.uniqueCode ?? ""),
      active: code.active === true, voided: !!code.voidedAt,
    }));
}

function loadSummary(load: { fileName: string | null; reportDate: Date; createdBy: string; createdAt: Date }) {
  return { fileName: load.fileName, reportDate: isoDay(load.reportDate), createdBy: load.createdBy, createdAt: load.createdAt.toISOString() };
}

// Cruza el reporte con Códigos cliente y avisa si el archivo ya se cargó o si ya hay una carga de esa fecha.
export async function previewUrbanoStock(input: unknown, fileHash: unknown, reportDate: unknown) {
  const rows = resolveUrbanoStock(sanitizeRows(input), await clientCodes());
  const hash = validHash(fileHash);
  const date = text(reportDate, 10);
  const [duplicateFile, sameDate] = await Promise.all([
    hash ? excelPostgres.urbanoStockLoad.findUnique({ where: { fileHash: hash } }) : null,
    /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? excelPostgres.urbanoStockLoad.findFirst({ where: { reportDate: new Date(`${date}T00:00:00.000Z`) }, orderBy: { createdAt: "desc" } })
      : null,
  ]);
  return {
    rows,
    duplicateFile: duplicateFile ? loadSummary(duplicateFile) : null,
    sameDate: sameDate ? loadSummary(sameDate) : null,
  };
}

type LoadMeta = { reportDate: Date; source: "excel" | "portal" | "api"; fileName: string | null; fileHash: string | null; actor: string };

// Guarda los renglones válidos. Si ya había una carga con la misma fecha de reporte, la reemplaza.
async function storeLoad(resolved: ResolvedUrbanoStockRow[], meta: LoadMeta) {
  const valid = resolved.filter((row) => row.status !== "error");
  if (valid.length === 0) throw new UrbanoStockError("No quedó ninguna fila válida para guardar.");
  const totalQuantity = valid.reduce((sum, row) => sum + row.quantity, 0);
  const load = await excelPostgres.$transaction(async (tx) => {
    const replaced = await tx.urbanoStockLoad.deleteMany({ where: { reportDate: meta.reportDate } });
    const created = await tx.urbanoStockLoad.create({
      data: {
        reportDate: meta.reportDate, source: meta.source, fileName: meta.fileName, fileHash: meta.fileHash,
        rowCount: valid.length, totalQuantity, createdBy: meta.actor,
      },
    });
    await tx.urbanoStockItem.createMany({
      data: valid.map((row) => ({
        loadId: created.id, clientCode: row.clientCode, product: row.product || null, quantity: row.quantity,
        unavailable: row.unavailable, pendingPickup: row.pendingPickup, company: row.company || null,
        client: row.client, uniqueCode: row.uniqueCode, sourceRow: row.row,
      })),
    });
    return { id: created.id, replaced: replaced.count };
  });
  return {
    id: load.id,
    saved: valid.length,
    replaced: load.replaced,
    totalQuantity,
    withoutClient: valid.filter((row) => !row.client).length,
    skipped: resolved.filter((row) => row.status === "error").map((row) => ({ row: row.row, clientCode: row.clientCode, messages: row.messages })),
  };
}

export async function saveUrbanoStock(input: unknown, fileName: unknown, fileHash: unknown, reportDate: unknown, actor: string) {
  const date = sanitizeDate(reportDate);
  const hash = validHash(fileHash);
  if (hash && (await excelPostgres.urbanoStockLoad.findUnique({ where: { fileHash: hash } }))) {
    throw new UrbanoStockError("Este archivo ya se cargó.", 409);
  }
  const resolved = resolveUrbanoStock(sanitizeRows(input), await clientCodes());
  return storeLoad(resolved, { reportDate: date, source: "excel", fileName: text(fileName) || null, fileHash: hash, actor });
}

// Fecha de hoy en Argentina, para las cargas que se traen del portal.
function argentinaToday() {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  return new Date(`${day}T00:00:00.000Z`);
}

// Trae el reporte "Stock en línea" del portal de Urbano y lo guarda como carga del día.
export async function syncUrbanoStockFromPortal(actor: string) {
  const { matrix, companies } = await fetchUrbanoPortalStock();
  const rows = parseUrbanoStockSheet(matrix);
  if (rows.length === 0) throw new UrbanoStockError("El portal de Urbano no devolvió productos.");
  const resolved = resolveUrbanoStock(rows, await clientCodes());
  const label = `Portal de Urbano (compañía ${companies.join(", ")})`;
  return storeLoad(resolved, { reportDate: argentinaToday(), source: "portal", fileName: label, fileHash: null, actor });
}

// Trae el stock de todas las cuentas desde la API de Urbano y lo guarda como carga del día. Un código que
// dejó de venir se quedó sin stock: se guarda en 0 para que no siga mostrando la cantidad de una carga vieja.
export async function syncUrbanoStockFromApi(actor: string) {
  const rows = urbanoApiStockRows(await fetchUrbanoApiProducts());
  if (rows.length === 0) throw new UrbanoStockError("La API de Urbano no devolvió productos.");
  const received = new Set(rows.map((row) => row.clientCode.toLowerCase()));
  const previous = await latestUrbanoStockByCode();
  const gone = [...previous].filter(([code, item]) => !received.has(code) && item.quantity !== 0);
  const withGone: UrbanoStockRow[] = [
    ...rows,
    ...gone.map(([, item], index) => ({
      row: rows.length + index + 1, clientCode: item.clientCode, product: item.product, quantity: 0, unavailable: 0, pendingPickup: 0, company: "",
    })),
  ];
  const resolved = resolveUrbanoStock(withGone, await clientCodes());
  const load = await storeLoad(resolved, { reportDate: argentinaToday(), source: "api", fileName: "API de Urbano", fileHash: null, actor });
  return { ...load, withoutStock: gone.length };
}

// La API si está configurada; si no, el portal de clientes.
export const syncUrbanoStock = (actor: string) => (urbanoApiConfig() ? syncUrbanoStockFromApi(actor) : syncUrbanoStockFromPortal(actor));

const MOVEMENTS_BATCH = 1000;

// Guarda los movimientos nuevos: los que ya estaban (la API repite los últimos días) se ignoran.
export async function syncUrbanoMovements() {
  const movements = await fetchUrbanoApiMovements();
  const { rows, skipped } = urbanoApiMovementRows(movements);
  if (movements.length > 0 && rows.length === 0) throw new UrbanoStockError("La API de Urbano devolvió movimientos que no se pudieron leer.");
  const find = urbanoCodeFinder(await clientCodes());
  let saved = 0;
  for (let start = 0; start < rows.length; start += MOVEMENTS_BATCH) {
    const { count } = await excelPostgres.urbanoMovement.createMany({
      data: rows.slice(start, start + MOVEMENTS_BATCH).map((row) => {
        const match = find(row.clientCode);
        return { ...row, client: match?.client ?? null, uniqueCode: match?.uniqueCode ?? null };
      }),
      skipDuplicates: true,
    });
    saved += count;
  }
  return { received: movements.length, saved, skipped };
}

const MOVEMENTS_LIMIT = 1000;

export async function listUrbanoMovements(type?: string | null) {
  const where = type ? { type } : {};
  const [items, total, types] = await Promise.all([
    excelPostgres.urbanoMovement.findMany({ where, orderBy: [{ date: "desc" }, { id: "desc" }], take: MOVEMENTS_LIMIT }),
    excelPostgres.urbanoMovement.count({ where }),
    excelPostgres.urbanoMovement.findMany({ distinct: ["type"], select: { type: true }, orderBy: { type: "asc" } }),
  ]);
  return {
    total,
    types: types.map((item) => item.type),
    items: items.map((item) => ({
      id: String(item.id), type: item.type, date: item.date.toISOString(), voucher: item.voucher, clientCode: item.clientCode,
      product: item.product ?? "", client: item.client, inQuantity: Number(item.inQuantity), outQuantity: Number(item.outQuantity),
    })),
  };
}

export async function listUrbanoStockLoads(limit = 30) {
  const loads = await excelPostgres.urbanoStockLoad.findMany({ orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }], take: limit });
  return loads.map((load) => ({
    id: load.id, ...loadSummary(load), source: load.source, rowCount: load.rowCount, totalQuantity: Number(load.totalQuantity),
  }));
}

export async function urbanoStockItems(loadId: string) {
  const items = await excelPostgres.urbanoStockItem.findMany({ where: { loadId }, orderBy: { sourceRow: "asc" } });
  return items.map((item) => ({
    clientCode: item.clientCode, product: item.product ?? "", quantity: Number(item.quantity),
    unavailable: Number(item.unavailable), pendingPickup: Number(item.pendingPickup),
    client: item.client, uniqueCode: item.uniqueCode,
  }));
}

export async function deleteUrbanoStockLoad(id: string) {
  const { count } = await excelPostgres.urbanoStockLoad.deleteMany({ where: { id } });
  if (!count) throw new UrbanoStockError("La carga no existe.", 404);
}

// Stock informado por Urbano para cada código cliente: el de la carga más reciente que lo trae.
export async function latestUrbanoStockByCode() {
  const rows = await excelPostgres.$queryRaw<{ codigo: string; original: string; producto: string | null; cantidad: unknown; fecha: Date }[]>`
    SELECT DISTINCT ON (lower(i.codigo_cliente)) lower(i.codigo_cliente) AS codigo, i.codigo_cliente AS original, i.producto, i.cantidad, c.fecha_reporte AS fecha
    FROM urbano_stock_items i JOIN urbano_stock_cargas c ON c.id = i.carga_id
    ORDER BY lower(i.codigo_cliente), c.fecha_reporte DESC, c.created_at DESC`;
  return new Map(rows.map((row) => [row.codigo, { clientCode: row.original, product: row.producto ?? "", quantity: Number(row.cantidad), reportDate: isoDay(row.fecha) }]));
}
