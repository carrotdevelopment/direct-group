import * as XLSX from "xlsx";
import fs from "node:fs";
import { excelPostgres } from "@/lib/excel-postgres-client-core";
import type { ExcelSantanderCostRow } from "@/lib/local-excel-db";

// Uso: tsx scripts/import-cost-structure-umiles-historical.ts <estructura-actual.xlsm> [<historia.xlsx> ...] [--dry-run]
// Cada archivo tiene una hoja con la fila de encabezado "Codigo Unico" y columnas:
// Fecha, Codigo Unico, CÓDIGO, PRODUCTO, PROVEEDOR, Categoria, Precio Público, IVA, PP s/IVA,
// PVC sin IVA, PVC con IVA, Mark Up, Costo DG sin iva, Flete, Seguro, Ing. Brutos, Imp. Débito,
// Imp. Crédito, Imp. Misiones, Utilidad, %, Bultos.
const files = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const dryRun = process.argv.includes("--dry-run");
if (files.length === 0) {
  console.error("Uso: tsx scripts/import-cost-structure-umiles-historical.ts <archivo.xlsx> [...] [--dry-run]");
  process.exit(1);
}

const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

// La fecha viene como Date o como número de serie de Excel según la hoja.
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "number" && value > 30000) return new Date(Math.round((value - 25569) * 86400 * 1000));
  return null;
}

// IVA viene como multiplicador (1,21 = 21 %); si llegara como fracción (0,21) también se entiende.
const vatPercent = (value: unknown) => {
  const n = num(value);
  if (n <= 0) return 0;
  return round(n < 1 ? n * 100 : (n - 1) * 100);
};

function readFile(path: string) {
  const workbook = XLSX.read(fs.readFileSync(path), { type: "buffer", cellDates: true });
  for (const sheetName of workbook.SheetNames) {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: true });
    const headerIndex = matrix.findIndex(
      (row) => text(row[0]) === "Fecha" && /^codigo unico$/i.test(text(row[1])),
    );
    if (headerIndex >= 0) return { sheetName, rows: matrix.slice(headerIndex + 1) };
  }
  throw new Error(`No encontré la hoja con encabezado "Fecha / Codigo Unico" en ${path}`);
}

function main() {
  const rows: ExcelSantanderCostRow[] = [];
  let skippedBlank = 0;
  let skippedPlaceholder = 0;

  for (const path of files) {
    const { sheetName, rows: dataRows } = readFile(path);
    let used = 0;
    for (const row of dataRows) {
      const date = toDate(row[0]);
      const uniqueCode = text(row[1]).toLowerCase();
      if (!date || !uniqueCode) {
        skippedBlank += 1;
        continue;
      }
      if (uniqueCode.includes("revisar archivo")) {
        skippedPlaceholder += 1;
        continue;
      }
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      const period = `${year}-${String(month).padStart(2, "0")}`;
      const pvcNoVat = round(num(row[9]));
      const profit = round(num(row[19]));
      const costDg = round(num(row[12]));
      const freight = round(num(row[13]));
      const insurance = round(num(row[14]));
      const grossIncome = round(num(row[15]));
      const debitTax = round(num(row[16]));
      const creditTax = round(num(row[17]));
      const missionsTax = round(num(row[18]));
      // El archivo no trae costo total: se deriva de PVC − utilidad (así respeta los cargos que
      // aplicaba cada mes); sin PVC, se suma costo + flete + cargos.
      const totalCost =
        pvcNoVat > 0 && row[19] !== ""
          ? round(pvcNoVat - profit)
          : round(costDg + freight + insurance + grossIncome + debitTax + creditTax + missionsTax);
      const markupMultiplier = num(row[11]);

      rows.push({
        client: "Umiles",
        period,
        month,
        year,
        date: `${period}-01`,
        clientCode: text(row[2]),
        uniqueCode,
        costUpdated: "",
        product: text(row[3]),
        supplier: text(row[4]),
        category: text(row[5]),
        publicPrice: round(num(row[6])),
        vatRate: vatPercent(row[7]),
        markup: markupMultiplier > 0 ? round((markupMultiplier - 1) * 100) : 0,
        ppNoVat: round(num(row[8])),
        costDgNoVat: costDg,
        insurance,
        grossIncome,
        debitTax,
        creditTax,
        freightNoVat: freight,
        totalCost,
        pvcNoVat,
        pvcWithVat: round(num(row[10])),
        profit,
        profitPercentage: round(num(row[20]) * 100),
        missionsTax,
        volumetricWeight: 0,
        unitsPerPackage: round(num(row[21])),
        source: "HISTORICO",
      });
      used += 1;
    }
    console.log(`${path.split(/[\\/]/).pop()} [${sheetName}]: ${used} filas válidas.`);
  }

  // Un mismo período + SKU con dos códigos cliente: queda la última fila (misma regla que Santander).
  const byKey = new Map<string, ExcelSantanderCostRow>();
  for (const row of rows) byKey.set(`${row.period}|${row.uniqueCode}`, row);
  const finalRows = [...byKey.values()];

  const byPeriod = new Map<string, number>();
  for (const row of finalRows) byPeriod.set(row.period, (byPeriod.get(row.period) || 0) + 1);
  console.log(
    `Válidas: ${rows.length}. Tras unificar duplicados: ${finalRows.length}. En blanco: ${skippedBlank}. Descartadas por SKU "revisar archivo": ${skippedPlaceholder}.`,
  );
  console.log("Por período:", Object.fromEntries([...byPeriod.entries()].sort()));
  console.log("Ejemplo:", JSON.stringify(finalRows[0]));

  if (dryRun) {
    console.log("Dry run: no se escribió nada en la base.");
    return Promise.resolve();
  }
  return excelPostgres
    .$transaction(
      async (transaction) => {
        for (const row of finalRows) {
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
      { timeout: 900_000 },
    )
    .then(() => console.log(`OK. ${finalRows.length} filas de Umiles cargadas en base_estructura_costos_santander.`));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
