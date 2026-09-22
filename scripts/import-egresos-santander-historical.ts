import * as XLSX from "xlsx";
import { appendGenericEgressRecords, DuplicateEgressImportError } from "@/lib/generic-egress-db";
import { createHash } from "node:crypto";
import fs from "node:fs";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Uso: tsx scripts/import-egresos-santander-historical.ts <ruta-al-xlsx>");
  process.exit(1);
}

async function main() {
  const buffer = fs.readFileSync(filePath);
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  console.log(`Leídas ${rows.length} filas de "${sheetName}" en ${filePath}`);
  console.log("Columnas:", Object.keys(rows[0] ?? {}));

  try {
    const result = await appendGenericEgressRecords(
      "Santander",
      rows,
      { type: "MIGRATION", fileName: filePath.split(/[\\/]/).pop(), fileHash, sheetName },
      "migracion-historica",
      {
        uniqueCode: (record) => String(record["Código Único"] ?? "").trim().toLowerCase(),
        product: (record) => String(record["Descripción"] ?? "").trim(),
      },
    );
    console.log("OK. Insertadas:", result.insertedRows, "Total Santander ahora:", result.totalRows);
  } catch (error) {
    if (error instanceof DuplicateEgressImportError) {
      console.error("DUPLICADO (no se importó nada):", error.message);
      process.exit(2);
    }
    throw error;
  }
}

void main();
