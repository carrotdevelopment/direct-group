import "dotenv/config";

import { createHash } from "node:crypto";
import { excelPostgres } from "../lib/excel-postgres-client-core";
import { egressSourceHash } from "../lib/egress-controls";
import {
  egressSchemas,
  readEgressRows,
  type EgressClient,
} from "../lib/operation-excel-db";
import {
  appendGenericEgressRecords,
  DuplicateEgressImportError,
} from "../lib/generic-egress-db";

// Algunos archivos fuente traen filas 100% idénticas (mismo pedido/orden/
// seguimiento repetido) por errores de exportación. Se descarta la copia
// extra antes de importar, quedándose con la primera aparición de cada una.
function dedupeExactRows(records: Record<string, unknown>[]) {
  const seen = new Set<string>();
  const unique: Record<string, unknown>[] = [];
  let dropped = 0;
  for (const record of records) {
    const hash = egressSourceHash(record);
    if (seen.has(hash)) {
      dropped++;
      continue;
    }
    seen.add(hash);
    unique.push(record);
  }
  return { unique, dropped };
}

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

// Varios archivos traen la columna "Año" corrupta en un puñado de filas
// (un dígito de más, o un signo negativo de más). Se corrige solo cuando
// otra columna de fecha del mismo archivo confirma el año real, y se
// documenta acá para que quede claro qué se tocó y por qué.
function replaceYear(records: Record<string, unknown>[], badYear: string, goodYear: string) {
  return records.map((record) => (record["Año"] === badYear ? { ...record, Año: goodYear } : record));
}

// Massalin: "20266" (2 filas) confirmado por Fecha=3/3/26 -> 2026.
// "202" (1 fila, sin Fecha de respaldo) queda afuera hasta confirmar el año.
function fixMassalinDateTypos(records: Record<string, unknown>[]) {
  const withoutAmbiguous = records.filter(
    (record) => !(record["Código Cliente"] === "REC-1124" && record["Año"] === "202" && !text(record["Nº Seguimiento"])),
  );
  return replaceYear(withoutAmbiguous, "20266", "2026");
}

async function sourceRows(client: EgressClient) {
  if (client === "Santander") {
    const rows = await excelPostgres.excelSantanderEgress.findMany({ orderBy: { id: "asc" } });
    if (rows.length) return rows.map(legacySantanderRecord);
  }
  const rows = readEgressRows({ client, limit: 1_000_000 }).reverse().map((row) =>
    Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith("__"))),
  );
  if (client === "Massalin") return fixMassalinDateTypos(rows);
  // Pampa: "20226" (24 filas) confirmado por Fecha Canje=3/17/26 -> 2026.
  if (client === "Pampa") return replaceYear(rows, "20226", "2026");
  // Umiles: "-2025" (46 filas) confirmado por Fecha canje en octubre/2025 -> 2025.
  if (client === "Umiles") return replaceYear(rows, "-2025", "2025");
  return rows;
}

async function main() {
  for (const client of Object.keys(egressSchemas) as EgressClient[]) {
    const records = await sourceRows(client);
    if (!records.length) {
      console.log(`[SKIP] ${client}: sin registros históricos.`);
      continue;
    }
    const { unique, dropped } = dedupeExactRows(records);
    if (dropped) {
      console.log(`[INFO] ${client}: se descartaron ${dropped} filas 100% duplicadas dentro del archivo.`);
    }
    const fileHash = createHash("sha256")
      .update(`migration-v1:${client}:${JSON.stringify(unique)}`)
      .digest("hex");
    try {
      const result = await appendGenericEgressRecords(client, unique, {
        type: "MIGRATION",
        fileName: client === "Santander" ? "base_egresos_santander" : `Base Egresos ${client} DG.xlsx`,
        fileHash,
        headers: [...egressSchemas[client]],
      });
      console.log(`[OK] ${client}: ${result.insertedRows} registros migrados.`);
    } catch (error) {
      if (error instanceof DuplicateEgressImportError) {
        console.log(`[SKIP] ${client}: ${error.message}`);
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
