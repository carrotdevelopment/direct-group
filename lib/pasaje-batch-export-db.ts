import "server-only";
import * as XLSX from "xlsx";
import type { PasajeRequest } from "../node_modules/.prisma/excel-client";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { canSeePasaje, type PasajeActor } from "@/lib/module-access";
import { PasajeAjusteError } from "@/lib/pasajes-ajustes-db";
import {
  certificateBase, certificatePrefix, nextCertificateNumber, requestFileName, requestRows, URBANO_ID_DATE_COLUMN, urbanoIdSheet, urbanoTemplate, urbanoTemplateFileName, urbanoTemplateSheet,
  urbanoUploadFileName, urbanoUploadSheet, type ExportPasaje,
} from "@/lib/pasaje-export";
import { buildRequestWorkbook } from "@/lib/pasaje-request-workbook";
import { readRequestTemplate } from "@/lib/pasaje-request-template";

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const same = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

// Shipper de cada cliente según la tabla de shippers (solo si está en uno solo activo).
async function shipperLookup() {
  const shippers = await excelPostgres.urbanoShipper.findMany({ where: { active: true } });
  return (client: string) => {
    const found = shippers.filter((shipper) => shipper.clients.some((name) => same(name, client)));
    return found.length === 1 ? found[0].code : "";
  };
}

function toExport(pasaje: PasajeRequest, shipperOf: (client: string) => string): ExportPasaje {
  const description = pasaje.product || pasaje.uniqueCode;
  return {
    requestDate: pasaje.requestDate ? isoDay(pasaje.requestDate) : isoDay(pasaje.createdAt),
    fromShipper: pasaje.fromShipper || shipperOf(pasaje.fromClient),
    fromClient: pasaje.fromClient,
    fromClientCode: pasaje.fromClientCode,
    fromDescription: pasaje.fromDescription || description,
    toShipper: pasaje.toShipper || shipperOf(pasaje.toClient),
    toClientCode: pasaje.toClientCode,
    toDescription: pasaje.toDescription || description,
    quantity: Number(pasaje.quantity),
    certificate: pasaje.urbanoCertificate,
  };
}

// Le da su ID de Urbano (PAS2409PAMPA1) a cada pasaje que todavía no tiene: el siguiente número libre de su
// base entre todos los certificados ya asignados. Los que ya tienen ID lo conservan, así que volver a
// exportar da el mismo ID y nunca se repite uno. El índice único frena dos exportaciones simultáneas: si
// chocan, se vuelve a intentar con los números actualizados.
async function assignUrbanoCertificates(pasajes: PasajeRequest[], dateOf: (pasaje: PasajeRequest) => string, shipper: string) {
  const missing = pasajes.filter((pasaje) => !pasaje.urbanoCertificate);
  if (missing.length === 0) return pasajes;
  const prefix = certificatePrefix(shipper);
  for (let attempt = 0; ; attempt += 1) {
    try {
      const assigned = await excelPostgres.$transaction(async (tx) => {
        const result = new Map<string, string>();
        const taken = new Map<string, string[]>();
        for (const pasaje of missing) {
          const base = certificateBase(dateOf(pasaje), pasaje.fromClient, prefix);
          if (!taken.has(base)) {
            const rows = await tx.pasajeRequest.findMany({
              where: { urbanoCertificate: { startsWith: base } },
              select: { urbanoCertificate: true },
            });
            taken.set(base, rows.map((row) => row.urbanoCertificate ?? ""));
          }
          const list = taken.get(base)!;
          const cert = `${base}${nextCertificateNumber(base, list)}`;
          list.push(cert);
          await tx.pasajeRequest.update({ where: { id: pasaje.id }, data: { urbanoCertificate: cert } });
          result.set(pasaje.id, cert);
        }
        return result;
      });
      return pasajes.map((pasaje) => (assigned.has(pasaje.id) ? { ...pasaje, urbanoCertificate: assigned.get(pasaje.id)! } : pasaje));
    } catch (error) {
      const duplicate = (error as { code?: string }).code === "P2002";
      if (!duplicate || attempt >= 2) throw error;
    }
  }
}

const ACTIVE = { not: "rejected" };

// Shippers y clientes de origen de un grupo de pasajes, con cuántos pasajes tiene cada uno.
function originsOf(rows: ExportPasaje[]) {
  const origins = new Map<string, { shipper: string; client: string; count: number }>();
  for (const row of rows) {
    const key = `${row.fromShipper}|${row.fromClient}`;
    const current = origins.get(key) ?? { shipper: row.fromShipper, client: row.fromClient, count: 0 };
    origins.set(key, { ...current, count: current.count + 1 });
  }
  return [...origins.values()];
}
const order = [{ sourceRow: "asc" as const }, { createdAt: "asc" as const }];

// Lotes recientes con al menos un pasaje que la persona ve, con los shippers de origen para exportar.
export async function listPasajeBatches(actor: PasajeActor) {
  const batches = await excelPostgres.pasajeBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { pasajes: { where: { status: ACTIVE }, orderBy: order } },
  });
  const shipperOf = await shipperLookup();
  return batches
    .filter((batch) => batch.pasajes.some((pasaje) => canSeePasaje(actor, pasaje)))
    .map((batch) => {
      const rows = batch.pasajes.map((pasaje) => toExport(pasaje, shipperOf));
      return {
        id: batch.id,
        fileName: batch.fileName,
        requestDate: batch.requestDate ? isoDay(batch.requestDate) : isoDay(batch.createdAt),
        createdBy: batch.createdBy,
        createdAt: batch.createdAt.toISOString(),
        count: rows.length,
        units: rows.reduce((sum, row) => sum + row.quantity, 0),
        destinations: [...new Set(batch.pasajes.map((pasaje) => pasaje.toClient))],
        origins: originsOf(rows),
      };
    })
    .filter((batch) => batch.count > 0);
}

// dateColumns: columna → formato de fecha de Excel (las fechas van como número de serie).
function workbookFile(rows: unknown[][], sheetName: string, dateColumns: Record<number, string> = {}) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  for (const [column, format] of Object.entries(dateColumns)) {
    for (let row = 1; row < rows.length; row += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: Number(column) })];
      if (cell) cell.z = format;
    }
  }
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// Arma uno de los Excel de un lote. "correo": la solicitud completa para mandarle a Urbano, con el formato
// de siempre (logo de Urbano, ORIGEN / DESTINO, totales y AUTORIZA).
// "urbano": la planilla de egresos de un shipper origen (y cliente) para subir en Urbano, con el formato
// propio de ese shipper; si no hay uno cargado, el formato Descripción. "urbano-id": el formato genérico con ID.
export async function pasajeBatchExcel(batchId: string, format: string, shipper: string, client: string, actor: PasajeActor) {
  const batch = await excelPostgres.pasajeBatch.findUnique({
    where: { id: batchId },
    include: { pasajes: { where: { status: ACTIVE }, orderBy: order } },
  });
  if (!batch) throw new PasajeAjusteError("El lote no existe.", 404);
  if (!batch.pasajes.some((pasaje) => canSeePasaje(actor, pasaje))) throw new PasajeAjusteError("No tenés acceso a este lote.", 403);
  if (batch.pasajes.length === 0) throw new PasajeAjusteError("El lote no tiene pasajes activos.", 409);
  const requestDate = batch.requestDate ? isoDay(batch.requestDate) : isoDay(batch.createdAt);
  return pasajesExcel(batch.pasajes, requestDate, () => requestDate, format, shipper, client);
}

// requestDate: la fecha de la solicitud (título y nombre del archivo). dateOf: la fecha de cada pasaje, para
// su ID de Urbano.
async function pasajesExcel(
  pasajes: PasajeRequest[], requestDate: string, dateOf: (pasaje: PasajeRequest) => string,
  format: string, shipper: string, client: string,
) {
  const shipperOf = await shipperLookup();
  const rows = pasajes.map((pasaje) => toExport(pasaje, shipperOf));

  if (format === "correo") {
    const bytes = buildRequestWorkbook(await readRequestTemplate(), requestRows(rows), requestDate);
    return { fileName: requestFileName(requestDate), bytes: Buffer.from(bytes) };
  }
  if (format !== "urbano" && format !== "urbano-id") throw new PasajeAjusteError("Formato inválido.");
  const chosen = pasajes.filter((pasaje, index) => rows[index].fromShipper === shipper && same(pasaje.fromClient, client));
  if (chosen.length === 0) throw new PasajeAjusteError("No hay pasajes de ese shipper y cliente.", 404);
  const selected = (await assignUrbanoCertificates(chosen, dateOf, shipper)).map((pasaje) => toExport(pasaje, shipperOf));
  const template = format === "urbano" ? urbanoTemplate(shipper) : null;
  if (template) {
    return {
      fileName: urbanoTemplateFileName(requestDate, client, shipper),
      bytes: workbookFile(urbanoTemplateSheet(template, selected, requestDate), template.sheetName, template.dateColumns),
    };
  }
  const fileName = urbanoUploadFileName(requestDate, client, shipper);
  if (format === "urbano-id") {
    return { fileName, bytes: workbookFile(urbanoIdSheet(selected, requestDate), "Hoja1", { [URBANO_ID_DATE_COLUMN]: "d-mmm" }) };
  }
  return { fileName, bytes: workbookFile(urbanoUploadSheet(selected, requestDate), "Hoja1") };
}

// --- Exportar por fechas: todos los pasajes solicitados entre dos días, de cualquier lote o cargados de a uno.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const pasajeDay = (pasaje: PasajeRequest) => isoDay(pasaje.requestDate ?? pasaje.createdAt);
// Día en Argentina (UTC-3) de un momento: para los pasajes cargados de a uno, que no tienen fecha de solicitud.
const argentinaDay = (date: Date) => isoDay(new Date(date.getTime() - 3 * 3_600_000));

export function checkRange(from: string, to: string) {
  if (!ISO_DAY.test(from) || !ISO_DAY.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    throw new PasajeAjusteError("Elegí la fecha desde y la fecha hasta.");
  }
  if (from > to) throw new PasajeAjusteError("La fecha desde no puede ser posterior a la fecha hasta.");
}

// Pasajes no rechazados y con destino cuya fecha de solicitud cae entre from y to, los dos días incluidos.
// Los cargados de a uno no tienen fecha de solicitud: cuenta el día en que se cargaron.
async function rangePasajes(actor: PasajeActor, from: string, to: string) {
  checkRange(from, to);
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  const pasajes = await excelPostgres.pasajeRequest.findMany({
    where: {
      status: { notIn: ["rejected", "no_destination"] },
      OR: [
        { requestDate: { gte: start, lte: end } },
        // Con un día de margen por la diferencia horaria; el día exacto se filtra abajo.
        { requestDate: null, createdAt: { gte: new Date(start.getTime() - DAY_MS), lt: new Date(end.getTime() + 2 * DAY_MS) } },
      ],
    },
    orderBy: [{ requestDate: "asc" }, { createdAt: "asc" }, { sourceRow: "asc" }],
  });
  return pasajes
    .map((pasaje) => (pasaje.requestDate ? pasaje : { ...pasaje, requestDate: new Date(`${argentinaDay(pasaje.createdAt)}T00:00:00.000Z`) }))
    .filter((pasaje) => pasajeDay(pasaje) >= from && pasajeDay(pasaje) <= to && canSeePasaje(actor, pasaje));
}

// Resumen para la pantalla: cuántos pasajes entran y los shippers de origen para las planillas de Urbano.
export async function pasajeRangeSummary(actor: PasajeActor, from: string, to: string) {
  const pasajes = await rangePasajes(actor, from, to);
  const shipperOf = await shipperLookup();
  const rows = pasajes.map((pasaje) => toExport(pasaje, shipperOf));
  return {
    from,
    to,
    count: rows.length,
    units: rows.reduce((sum, row) => sum + row.quantity, 0),
    origins: originsOf(rows),
    destinations: [...new Set(pasajes.map((pasaje) => pasaje.toClient))],
  };
}

// Los mismos Excel que un lote, con los pasajes del rango. La solicitud sale con la fecha "hasta".
export async function pasajeRangeExcel(actor: PasajeActor, from: string, to: string, format: string, shipper: string, client: string) {
  const pasajes = await rangePasajes(actor, from, to);
  if (pasajes.length === 0) throw new PasajeAjusteError("No hay pasajes solicitados entre esas fechas.", 404);
  return pasajesExcel(pasajes, to, pasajeDay, format, shipper, client);
}
