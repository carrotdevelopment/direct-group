import "server-only";
import { excelPostgres } from "@/lib/excel-postgres-client";
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

type LoadMeta = { reportDate: Date; source: "excel" | "portal"; fileName: string | null; fileHash: string | null; actor: string };

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
  const rows = await excelPostgres.$queryRaw<{ codigo: string; cantidad: unknown; fecha: Date }[]>`
    SELECT DISTINCT ON (lower(i.codigo_cliente)) lower(i.codigo_cliente) AS codigo, i.cantidad, c.fecha_reporte AS fecha
    FROM urbano_stock_items i JOIN urbano_stock_cargas c ON c.id = i.carga_id
    ORDER BY lower(i.codigo_cliente), c.fecha_reporte DESC, c.created_at DESC`;
  return new Map(rows.map((row) => [row.codigo, { quantity: Number(row.cantidad), reportDate: isoDay(row.fecha) }]));
}
