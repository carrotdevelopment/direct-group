import * as XLSX from "xlsx";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { excelPostgres } from "@/lib/excel-postgres-client-core";
import {
  appendGenericEgressRecords,
  canonicalizeEgressRecord,
  DuplicateEgressImportError,
} from "@/lib/generic-egress-db";

// Uso: tsx scripts/import-egresos-umiles-delta.ts <"3 - Ingresos y Egresos Umiles.xlsm"> [--dry-run]
// Carga solo los egresos de la hoja EgresosUmilles que todavía no están en la base (cruce por
// fecha + código cliente + operación + cantidad), para no repetir los ya importados.
const filePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!filePath) {
  console.error('Uso: tsx scripts/import-egresos-umiles-delta.ts "<archivo.xlsm>" [--dry-run]');
  process.exit(1);
}

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();
const isoDate = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10);

async function main() {
  const buffer = fs.readFileSync(filePath);
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = "EgresosUmilles";
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: true });
  const headerIndex = matrix.findIndex((row) => String(row[0]).trim() === "Dia");
  if (headerIndex < 0) throw new Error("No encontré el encabezado (columna Dia) en EgresosUmilles.");
  const headers = matrix[headerIndex].map((header) => String(header).trim());
  const records = matrix
    .slice(headerIndex + 1)
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]])) as Record<string, unknown>)
    .filter((record) => String(record["Código Cliente"] ?? "").trim() !== "" && record["Dia"] !== "");
  // Algunas filas traen el año con signo negativo (-2025): es un error de carga, el año real es el positivo.
  let fixedYears = 0;
  for (const record of records) {
    if (typeof record["Año"] === "number" && record["Año"] < 0) {
      record["Año"] = Math.abs(record["Año"]);
      fixedYears += 1;
    }
  }
  if (fixedYears) console.log(`Años negativos corregidos: ${fixedYears}.`);
  console.log(`Filas con datos en ${sheetName}: ${records.length}`);

  const profile = await excelPostgres.egressImportProfile.findFirst({ where: { client: "Umiles", active: true } });
  if (!profile) throw new Error("No hay perfil de importación activo para Umiles.");
  const mapping = profile.mapping as Parameters<typeof canonicalizeEgressRecord>[1];

  const existing = await excelPostgres.egress.findMany({
    where: { client: { equals: "Umiles", mode: "insensitive" }, deletedAt: null },
    select: { date: true, clientCode: true, operation: true, quantity: true },
  });
  const have = new Map<string, number>();
  for (const row of existing) {
    const key = `${isoDate(row.date)}|${normalize(row.clientCode)}|${String(row.operation).toUpperCase()}|${Number(row.quantity)}`;
    have.set(key, (have.get(key) ?? 0) + 1);
  }

  const fresh: Record<string, unknown>[] = [];
  const invalid: number[] = [];
  records.forEach((record, index) => {
    const canonical = canonicalizeEgressRecord(record, mapping, { fallbackOperation: "CANJE" });
    if (!canonical.date) {
      invalid.push(index + headerIndex + 2);
      return;
    }
    const key = `${isoDate(canonical.date as Date | string)}|${normalize(canonical.clientCode)}|${String(canonical.operation).toUpperCase()}|${Number(canonical.quantity)}`;
    const remaining = have.get(key) ?? 0;
    if (remaining > 0) have.set(key, remaining - 1);
    else fresh.push(record);
  });

  const byMonth: Record<string, number> = {};
  for (const record of fresh) {
    const canonical = canonicalizeEgressRecord(record, mapping, { fallbackOperation: "CANJE" });
    const month = isoDate(canonical.date as Date | string).slice(0, 7);
    byMonth[month] = (byMonth[month] ?? 0) + 1;
  }
  console.log(`Ya estaban en la base: ${records.length - fresh.length - invalid.length}. Nuevos: ${fresh.length}. Sin fecha válida: ${invalid.length}.`);
  console.log("Nuevos por mes:", JSON.stringify(Object.fromEntries(Object.entries(byMonth).sort())));
  if (invalid.length) console.log("Filas sin fecha (número de fila del Excel):", invalid.slice(0, 20).join(", "));

  if (dryRun || fresh.length === 0) {
    console.log(dryRun ? "Dry run: no se escribió nada." : "No hay filas nuevas.");
    return;
  }
  try {
    const result = await appendGenericEgressRecords(
      "Umiles",
      fresh,
      { type: "MIGRATION", fileName: filePath.split(/[\\/]/).pop(), fileHash, sheetName, headers },
      "migracion-umiles-delta",
      {
        uniqueCode: (record) => String(record["Código Único"] ?? "").trim().toLowerCase(),
        product: (record) => String(record["PRODUCTO"] ?? "").trim(),
      },
    );
    console.log("OK. Insertadas:", result.insertedRows, "Total Umiles ahora:", result.totalRows);
  } catch (error) {
    if (error instanceof DuplicateEgressImportError) {
      console.error("DUPLICADO (no se importó nada):", error.message);
      process.exit(2);
    }
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
