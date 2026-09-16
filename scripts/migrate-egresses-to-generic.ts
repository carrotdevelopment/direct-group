import "dotenv/config";

import { createHash } from "node:crypto";
import { excelPostgres } from "../lib/excel-postgres-client-core";
import {
  egressSchemas,
  readEgressRows,
  type EgressClient,
} from "../lib/operation-excel-db";
import {
  appendGenericEgressRecords,
  DuplicateEgressImportError,
} from "../lib/generic-egress-db";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function legacySantanderRecord(row: {
  day: number | null;
  month: number | null;
  year: number | null;
  guideNumber: string | null;
  date: Date | null;
  legacyId: string | null;
  sku: string | null;
  locality: string | null;
  province: string | null;
  postalCode: string | null;
  quantity: { toString(): string } | null;
  quantityOriginal: string | null;
  operation: string | null;
  destination: string | null;
  comment: string | null;
}) {
  return {
    Dia: row.day ?? "",
    Mes: row.month ?? "",
    Año: row.year ?? "",
    "Nro guia": text(row.guideNumber),
    Fecha: row.date?.toISOString().slice(0, 10) ?? "",
    ID: text(row.legacyId),
    SKU: text(row.sku),
    Localidad: text(row.locality),
    Provincia: text(row.province),
    CP: text(row.postalCode),
    Cantidad: row.quantity?.toString() ?? text(row.quantityOriginal),
    Operación: text(row.operation),
    Destino: text(row.destination),
    Comentario: text(row.comment),
  };
}

async function sourceRows(client: EgressClient) {
  if (client === "Santander") {
    const rows = await excelPostgres.excelSantanderEgress.findMany({ orderBy: { id: "asc" } });
    if (rows.length) return rows.map(legacySantanderRecord);
  }
  return readEgressRows({ client, limit: 1_000_000 }).reverse().map((row) =>
    Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith("__"))),
  );
}

async function main() {
  for (const client of Object.keys(egressSchemas) as EgressClient[]) {
    const records = await sourceRows(client);
    if (!records.length) {
      console.log(`[SKIP] ${client}: sin registros históricos.`);
      continue;
    }
    const fileHash = createHash("sha256")
      .update(`migration-v1:${client}:${JSON.stringify(records)}`)
      .digest("hex");
    try {
      const result = await appendGenericEgressRecords(client, records, {
        type: "MIGRATION",
        fileName: client === "Santander" ? "base_egresos_santander" : `Base Egresos ${client} DG.xlsx`,
        fileHash,
        headers: [...egressSchemas[client]],
      });
      console.log(`[OK] ${client}: ${result.insertedRows} registros migrados.`);
    } catch (error) {
      if (error instanceof DuplicateEgressImportError) {
        console.log(`[SKIP] ${client}: migración ya aplicada.`);
        continue;
      }
      throw error;
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await excelPostgres.$disconnect();
  });
