import "server-only";
import * as XLSX from "xlsx";
import type { PasajeRequest } from "../node_modules/.prisma/excel-client";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { canSeePasaje, type PasajeActor } from "@/lib/module-access";
import { PasajeAjusteError } from "@/lib/pasajes-ajustes-db";
import {
  requestFileName, requestSheet, URBANO_ID_DATE_COLUMN, urbanoIdSheet, urbanoUploadFileName, urbanoUploadSheet, type ExportPasaje,
} from "@/lib/pasaje-export";

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
  };
}

const ACTIVE = { not: "rejected" };
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
      const origins = new Map<string, { shipper: string; client: string; count: number }>();
      for (const row of rows) {
        const key = `${row.fromShipper}|${row.fromClient}`;
        const current = origins.get(key) ?? { shipper: row.fromShipper, client: row.fromClient, count: 0 };
        origins.set(key, { ...current, count: current.count + 1 });
      }
      return {
        id: batch.id,
        fileName: batch.fileName,
        requestDate: batch.requestDate ? isoDay(batch.requestDate) : isoDay(batch.createdAt),
        createdBy: batch.createdBy,
        createdAt: batch.createdAt.toISOString(),
        count: rows.length,
        units: rows.reduce((sum, row) => sum + row.quantity, 0),
        destinations: [...new Set(batch.pasajes.map((pasaje) => pasaje.toClient))],
        origins: [...origins.values()],
      };
    })
    .filter((batch) => batch.count > 0);
}

function workbookFile(rows: unknown[][], sheetName: string, dateColumn?: number) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  if (dateColumn !== undefined) {
    for (let row = 1; row < rows.length; row += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: dateColumn })];
      if (cell) cell.z = "d-mmm";
    }
  }
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// Arma uno de los Excel de un lote. "correo": la solicitud completa para mandarle a Urbano.
// "urbano" y "urbano-id": la planilla de egresos de un shipper origen (y cliente) para subir en Urbano, en
// cada uno de los dos formatos que usan.
export async function pasajeBatchExcel(batchId: string, format: string, shipper: string, client: string, actor: PasajeActor) {
  const batch = await excelPostgres.pasajeBatch.findUnique({
    where: { id: batchId },
    include: { pasajes: { where: { status: ACTIVE }, orderBy: order } },
  });
  if (!batch) throw new PasajeAjusteError("El lote no existe.", 404);
  if (!batch.pasajes.some((pasaje) => canSeePasaje(actor, pasaje))) throw new PasajeAjusteError("No tenés acceso a este lote.", 403);
  if (batch.pasajes.length === 0) throw new PasajeAjusteError("El lote no tiene pasajes activos.", 409);
  const shipperOf = await shipperLookup();
  const rows = batch.pasajes.map((pasaje) => toExport(pasaje, shipperOf));
  const requestDate = batch.requestDate ? isoDay(batch.requestDate) : isoDay(batch.createdAt);

  if (format === "correo") {
    return { fileName: requestFileName(requestDate), bytes: workbookFile(requestSheet(rows), "Solicitud") };
  }
  if (format !== "urbano" && format !== "urbano-id") throw new PasajeAjusteError("Formato inválido.");
  const selected = rows.filter((row) => row.fromShipper === shipper && same(row.fromClient, client));
  if (selected.length === 0) throw new PasajeAjusteError("Ese lote no tiene pasajes de ese shipper y cliente.", 404);

  // El certificado sigue la numeración del día para ese cliente: cuenta los pasajes del mismo cliente y
  // fecha cargados en lotes anteriores.
  const earlier = await excelPostgres.pasajeRequest.count({
    where: {
      status: ACTIVE,
      fromClient: { equals: client, mode: "insensitive" },
      requestDate: new Date(`${requestDate}T00:00:00.000Z`),
      batch: { createdAt: { lt: batch.createdAt } },
    },
  });
  const fileName = urbanoUploadFileName(requestDate, client, shipper);
  if (format === "urbano-id") {
    return { fileName, bytes: workbookFile(urbanoIdSheet(selected, requestDate, earlier + 1), "Hoja1", URBANO_ID_DATE_COLUMN) };
  }
  return { fileName, bytes: workbookFile(urbanoUploadSheet(selected, requestDate, earlier + 1), "Hoja1") };
}
