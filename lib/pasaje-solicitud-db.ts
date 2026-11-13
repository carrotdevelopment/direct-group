import "server-only";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { createPasajeWithMovements, linkUrbanoPasajeOutgoings, PasajeAjusteError } from "@/lib/pasajes-ajustes-db";
import { invalidateIncomeGroups } from "@/lib/postgres-operation-db";
import type { PasajeActor } from "@/lib/module-access";
import { markDuplicates, markStockShortages, resolveSolicitud, type SolicitudRow } from "@/lib/pasaje-solicitud";
import { availableStockForCodes } from "@/lib/pasaje-stock-db";

const MAX_ROWS = 300;
const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();
const text = (value: unknown, max = 255) => String(value ?? "").trim().slice(0, max);

function sanitizeRows(input: unknown): SolicitudRow[] {
  if (!Array.isArray(input) || input.length === 0) throw new PasajeAjusteError("La solicitud no tiene filas para cargar.");
  if (input.length > MAX_ROWS) throw new PasajeAjusteError(`Se pueden cargar hasta ${MAX_ROWS} pasajes por solicitud.`);
  const quantity = (value: unknown) => (value === null || value === "" || value === undefined ? null : Number(value));
  return input.map((item, index) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const date = text(row.requestDate, 10);
    return {
      row: Number(row.row) || index + 1,
      requestDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      fromShipper: text(row.fromShipper, 20),
      fromClientCode: text(row.fromClientCode),
      fromDescription: text(row.fromDescription),
      fromQuantity: quantity(row.fromQuantity),
      toShipper: text(row.toShipper, 20),
      toClientCode: text(row.toClientCode),
      toDescription: text(row.toDescription),
      toQuantity: quantity(row.toQuantity),
    };
  });
}

async function references() {
  const [codes, shippers] = await Promise.all([
    excelPostgres.excelClientCode.findMany({ select: { client: true, clientCode: true, uniqueCode: true, active: true, voidedAt: true } }),
    excelPostgres.urbanoShipper.findMany(),
  ]);
  return {
    codes: codes
      .filter((code) => code.client && code.clientCode && code.uniqueCode)
      .map((code) => ({
        client: String(code.client), clientCode: String(code.clientCode), uniqueCode: String(code.uniqueCode),
        active: code.active === true, voided: !!code.voidedAt,
      })),
    shippers: shippers.map((shipper) => ({ code: shipper.code, name: shipper.name, clients: shipper.clients, active: shipper.active })),
  };
}

const isoDay = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);
const validHash = (value: unknown) => (typeof value === "string" && /^[a-f0-9]{64}$/.test(value) ? value : null);

// Resuelve las filas, marca las que ya están cargadas como pasaje y avisa si el archivo ya se cargó.
export async function previewSolicitud(input: unknown, fileHash?: unknown) {
  const rows = sanitizeRows(input);
  const { codes, shippers } = await references();
  const resolved = resolveSolicitud(rows, codes, shippers);
  const dates = [...new Set(resolved.map((row) => row.requestDate).filter((date): date is string => !!date))];
  const existing = await excelPostgres.pasajeRequest.findMany({
    where: { status: { not: "rejected" }, requestDate: { in: dates.map((date) => new Date(`${date}T00:00:00.000Z`)) } },
    select: { fromClientCode: true, toClientCode: true, quantity: true, requestDate: true, status: true, createdBy: true, createdAt: true },
  });
  const hash = validHash(fileHash);
  const previousFile = hash ? await excelPostgres.pasajeBatch.findUnique({ where: { fileHash: hash } }) : null;
  const checked = markDuplicates(resolved, existing.map((pasaje) => ({
    fromClientCode: pasaje.fromClientCode, toClientCode: pasaje.toClientCode, quantity: Number(pasaje.quantity),
    requestDate: isoDay(pasaje.requestDate), status: pasaje.status, createdBy: pasaje.createdBy, createdAt: pasaje.createdAt.toISOString(),
  })));
  return {
    rows: markStockShortages(checked, await originStock(checked)),
    duplicateFile: previousFile
      ? { fileName: previousFile.fileName, createdBy: previousFile.createdBy, createdAt: previousFile.createdAt.toISOString() }
      : null,
  };
}

// Stock disponible de cada código origen de la solicitud, por "cliente|código".
async function originStock(rows: { status: string; fromClient: string | null; fromClientCode: string }[]) {
  const codesByClient = new Map<string, Set<string>>();
  for (const row of rows) {
    if ((row.status !== "ok" && row.status !== "warning") || !row.fromClient) continue;
    codesByClient.set(row.fromClient, (codesByClient.get(row.fromClient) ?? new Set()).add(row.fromClientCode));
  }
  const available = new Map<string, number>();
  for (const [client, codes] of codesByClient) {
    const stock = await availableStockForCodes(client, [...codes]);
    for (const code of codes) available.set(`${normalize(client)}|${normalize(code)}`, stock.get(code.trim().toLowerCase())?.available ?? 0);
  }
  return available;
}

export function listUrbanoShippers() {
  return excelPostgres.urbanoShipper.findMany({ orderBy: { code: "asc" } });
}

// Crea el lote con las filas válidas (las que tienen error no se cargan). Cada pasaje espera la aprobación de
// la encargada del origen, que es cuando egresa y queda el ingreso pendiente en el destino.
export async function createSolicitud(input: unknown, fileName: unknown, fileHash: unknown, actor: PasajeActor) {
  const { rows: resolved, duplicateFile } = await previewSolicitud(input, fileHash);
  if (duplicateFile) {
    throw new PasajeAjusteError(`Este archivo ya se cargó (${duplicateFile.createdBy}, ${new Date(duplicateFile.createdAt).toLocaleDateString("es-AR")}). Para cargar filas corregidas, subí un Excel solo con esas filas.`, 409);
  }
  const valid = resolved.filter((row) => (row.status === "ok" || row.status === "warning") && row.fromClient && row.toClient && row.uniqueCode && row.quantity);
  if (valid.length === 0) throw new PasajeAjusteError("Ninguna fila de la solicitud se puede cargar: revisá los errores.");

  const products = await excelPostgres.excelProduct.findMany({
    // Los códigos únicos de Productos se guardan en minúsculas.
    where: { uniqueCode: { in: [...new Set(valid.map((row) => normalize(row.uniqueCode)))] } },
    select: { uniqueCode: true, product: true },
  });
  const productName = new Map(products.map((product) => [normalize(product.uniqueCode), String(product.product ?? "")]));
  const requestDate = valid.find((row) => row.requestDate)?.requestDate ?? null;
  const toDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);

  const data = valid.map((row) => ({
    fromClient: row.fromClient as string,
    fromClientCode: row.fromClientCode,
    toClient: row.toClient as string,
    toClientCode: row.toClientCode,
    uniqueCode: row.uniqueCode as string,
    product: (productName.get(normalize(row.uniqueCode)) || row.fromDescription || row.toDescription || "").slice(0, 255) || null,
    comments: null,
    quantity: row.quantity as number,
    createdBy: actor.name,
    requestDate: toDate(row.requestDate),
    fromShipper: row.fromShipper || null,
    toShipper: row.toShipper || null,
    sourceRow: row.row,
    fromDescription: row.fromDescription || null,
    toDescription: row.toDescription || null,
    warning: row.status === "warning" ? row.messages.join(" ") : null,
  }));

  const batch = await excelPostgres.$transaction(async (tx) => {
    const created = await tx.pasajeBatch.create({
      data: { fileName: text(fileName) || null, fileHash: validHash(fileHash), requestDate: toDate(requestDate), createdBy: actor.name },
    });
    for (const row of data) await createPasajeWithMovements(tx, { ...row, batchId: created.id });
    return created;
  }, { timeout: 120_000 }); // Hasta 300 pasajes, con tres inserciones cada uno.
  invalidateIncomeGroups();
  // Si Urbano ya informó alguna de estas salidas, queda vinculada ahora.
  await linkUrbanoPasajeOutgoings().catch(() => undefined);

  return {
    batchId: batch.id,
    created: data.length,
    skipped: resolved.filter((row) => row.status === "error" || row.status === "excluded").map((row) => ({ row: row.row, messages: row.messages })),
  };
}
