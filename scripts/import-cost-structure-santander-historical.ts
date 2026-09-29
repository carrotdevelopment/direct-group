import * as XLSX from "xlsx";
import fs from "node:fs";
import { excelPostgres } from "@/lib/excel-postgres-client-core";
import type { ExcelSantanderCostRow } from "@/lib/local-excel-db";

// Reimplementa lib/postgres-replica-db.ts#upsertSantanderCostsInPostgres: no se puede
// importar ese módulo desde un script standalone porque encadena "server-only".
async function upsertSantanderCostsInPostgres(rows: ExcelSantanderCostRow[]) {
  await excelPostgres.$transaction(
    async (transaction) => {
      for (const row of rows) {
        await transaction.excelSantanderCost.deleteMany({
          where: { client: row.client, period: row.period, uniqueCode: row.uniqueCode },
        });
        await transaction.excelSantanderCost.create({
          data: {
            client: row.client, period: row.period, month: row.month, year: row.year,
            date: row.date ? new Date(`${row.date}T00:00:00.000Z`) : null,
            clientCode: row.clientCode, uniqueCode: row.uniqueCode, updatedCost: row.costUpdated,
            product: row.product, supplier: row.supplier, category: row.category,
            publicPrice: row.publicPrice, vat: row.vatRate, markup: row.markup,
            publicPriceNoVat: row.ppNoVat, dgCostNoVat: row.costDgNoVat, insurance: row.insurance,
            grossIncomeTax: row.grossIncome, debitTax: row.debitTax, creditTax: row.creditTax,
            freightNoVat: row.freightNoVat, totalCost: row.totalCost, salePriceNoVat: row.pvcNoVat,
            salePriceWithVat: row.pvcWithVat, profit: row.profit, percentage: row.profitPercentage,
            missionsTax: row.missionsTax, volumetricWeight: row.volumetricWeight,
            packages: row.unitsPerPackage, origin: row.source,
          },
        });
      }
    },
    { timeout: 600_000 },
  );
}

const filePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!filePath) {
  console.error(
    "Uso: tsx scripts/import-cost-structure-santander-historical.ts <ruta-al-xlsm> [--dry-run]",
  );
  process.exit(1);
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function periodOf(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function main() {
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets["Estructura de costo"];
  if (!sheet) {
    console.error(
      `No encontré la hoja "Estructura de costo". Hojas disponibles: ${workbook.SheetNames.join(", ")}`,
    );
    process.exit(1);
  }

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  const headerIndex = matrix.findIndex((row) =>
    row.some((cell) => text(cell) === "Codigo Unico"),
  );
  if (headerIndex === -1) {
    console.error('No encontré la fila de encabezados (columna "Codigo Unico").');
    process.exit(1);
  }

  const dataRows = matrix.slice(headerIndex + 1);
  const rows: ExcelSantanderCostRow[] = [];
  let skippedBlank = 0;

  for (const row of dataRows) {
    const date = row[0];
    const uniqueCode = text(row[2]).toLowerCase();
    if (!(date instanceof Date) || !uniqueCode) {
      skippedBlank += 1;
      continue;
    }
    const period = periodOf(date);
    const vat = round(num(row[8]) * 100);
    const markupMultiplier = num(row[9]);

    rows.push({
      client: "Santander",
      period,
      month: date.getUTCMonth() + 1,
      year: date.getUTCFullYear(),
      date: `${period}-01`,
      clientCode: text(row[1]),
      uniqueCode,
      costUpdated: text(row[3]),
      product: text(row[4]),
      supplier: text(row[5]),
      category: text(row[6]),
      publicPrice: round(num(row[7])),
      vatRate: vat,
      markup: round((markupMultiplier - 1) * 100),
      ppNoVat: round(num(row[10])),
      costDgNoVat: round(num(row[11])),
      insurance: round(num(row[12])),
      grossIncome: round(num(row[13])),
      debitTax: round(num(row[14])),
      creditTax: round(num(row[15])),
      freightNoVat: round(num(row[16])),
      totalCost: round(num(row[17])),
      pvcNoVat: round(num(row[18])),
      pvcWithVat: round(num(row[19])),
      profit: round(num(row[20])),
      profitPercentage: round(num(row[21]) * 100),
      missionsTax: round(num(row[22])),
      volumetricWeight: round(num(row[23])),
      unitsPerPackage: round(num(row[24])),
      source: "HISTORICO",
    });
  }

  const byPeriod = new Map<string, number>();
  for (const row of rows) byPeriod.set(row.period, (byPeriod.get(row.period) || 0) + 1);

  console.log(`Filas leídas: ${dataRows.length}. Válidas: ${rows.length}. Omitidas (en blanco): ${skippedBlank}.`);
  console.log("Por período:", Object.fromEntries([...byPeriod.entries()].sort()));
  console.log("Ejemplo de fila:", JSON.stringify(rows[0]));

  if (dryRun) {
    console.log("Dry run: no se escribió nada en la base.");
    return Promise.resolve();
  }

  return upsertSantanderCostsInPostgres(rows).then(() => {
    console.log(`OK. ${rows.length} filas cargadas/actualizadas en base_estructura_costos_santander.`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
