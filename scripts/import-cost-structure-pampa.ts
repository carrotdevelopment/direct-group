import * as XLSX from "xlsx";
import fs from "node:fs";
import { excelPostgres } from "@/lib/excel-postgres-client-core";
import type { ExcelSantanderCostRow } from "@/lib/local-excel-db";

// Uso: tsx scripts/import-cost-structure-pampa.ts "<2- Estructura de costo Pampa.xlsm>" [--dry-run]
// Carga la hoja "Estructura de costo" de Pampa (una fila por mes y código) en la estructura de costos de la
// plataforma, como la de Umiles: una fila por período + código cliente; si ya existe, se reemplaza.
// Columnas (por nombre): FECHA, CODIGO PAMPA, CODIGO UNICO, Actualizado, PRODUCTO, PROVEEDOR, CATEGORÍA,
// Precio Público, IVA, Mark Up, PP s/IVA, Costo DG s/ IVA, Seguro, Ing. Brutos, Imp. Débito, Imp. Crédito,
// Imp. Misiones, FLETE, Costo Total, PV actual (precio de venta sin IVA), Utilidad, Margen (%), Bultos.
const CLIENT = "Pampa";
const SHEET = "Estructura de costo";
const filePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!filePath) {
  console.error('Uso: tsx scripts/import-cost-structure-pampa.ts "<archivo.xlsm>" [--dry-run]');
  process.exit(1);
}

const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const normHeader = (value: unknown) => text(value).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

// La fecha viene como Date (medianoche en la zona horaria de la máquina que lee: 00:00 o 03:00 UTC) o como
// número de serie de Excel. Se le suman 12 horas para quedarse con el día, corra donde corra.
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return new Date(value.getTime() + 12 * 3_600_000);
  if (typeof value === "number" && value > 30000) return new Date(Math.round((value - 25569) * 86400 * 1000));
  return null;
}

// IVA y Mark Up vienen como multiplicador (1,21 = 21 %).
const percentFromMultiplier = (value: unknown) => {
  const n = num(value);
  if (n <= 0) return 0;
  return round(n < 1 ? n * 100 : (n - 1) * 100);
};

function readRows() {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer", cellDates: true, sheets: [SHEET] });
  const sheet = workbook.Sheets[SHEET];
  if (!sheet) throw new Error(`No encontré la hoja "${SHEET}".`);
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  const headerIndex = matrix.findIndex((row) => normHeader(row[0]) === "fecha" && normHeader(row[2]) === "codigo unico");
  if (headerIndex < 0) throw new Error('No encontré el encabezado "FECHA / CODIGO UNICO".');
  const headers = matrix[headerIndex].map(normHeader);
  const col = (name: string) => {
    const index = headers.indexOf(normHeader(name));
    if (index < 0) throw new Error(`Falta la columna "${name}".`);
    return index;
  };
  return {
    rows: matrix.slice(headerIndex + 1),
    c: {
      date: col("FECHA"), clientCode: col("CODIGO PAMPA"), uniqueCode: col("CODIGO UNICO"), updated: col("Actualizado"),
      product: col("PRODUCTO"), supplier: col("PROVEEDOR"), category: col("CATEGORÍA"), publicPrice: col("Precio Público"),
      vat: col("IVA"), markup: col("Mark Up"), ppNoVat: col("PP s/IVA"), costDg: col("Costo DG s/ IVA"), insurance: col("Seguro"),
      grossIncome: col("Ing. Brutos"), debitTax: col("Imp. Débito"), creditTax: col("Imp. Crédito"), missionsTax: col("Imp. Misiones"),
      freight: col("FLETE"), totalCost: col("Costo Total"), salePrice: col("PV actual"), profit: col("Utilidad"),
      margin: col("Margen (%)"), packages: col("Bultos"),
    },
  };
}

async function main() {
  const { rows: dataRows, c } = readRows();
  const rows: ExcelSantanderCostRow[] = [];
  let skippedBlank = 0;
  for (const row of dataRows) {
    const date = toDate(row[c.date]);
    const clientCode = text(row[c.clientCode]);
    const uniqueCode = text(row[c.uniqueCode]).toLowerCase();
    if (!date || (!clientCode && !uniqueCode)) {
      skippedBlank += 1;
      continue;
    }
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const period = `${year}-${String(month).padStart(2, "0")}`;
    const salePrice = round(num(row[c.salePrice]));
    const vatRate = percentFromMultiplier(row[c.vat]);
    rows.push({
      client: CLIENT,
      period,
      month,
      year,
      date: `${period}-01`,
      clientCode,
      uniqueCode,
      costUpdated: text(row[c.updated]),
      product: text(row[c.product]),
      supplier: text(row[c.supplier]),
      category: text(row[c.category]),
      publicPrice: round(num(row[c.publicPrice])),
      vatRate,
      markup: percentFromMultiplier(row[c.markup]),
      ppNoVat: round(num(row[c.ppNoVat])),
      costDgNoVat: round(num(row[c.costDg])),
      insurance: round(num(row[c.insurance])),
      grossIncome: round(num(row[c.grossIncome])),
      debitTax: round(num(row[c.debitTax])),
      creditTax: round(num(row[c.creditTax])),
      freightNoVat: round(num(row[c.freight])),
      totalCost: round(num(row[c.totalCost])),
      pvcNoVat: salePrice,
      // El archivo no trae el precio de venta con IVA: se calcula con el IVA de la fila.
      pvcWithVat: round(salePrice * (1 + (vatRate || 21) / 100)),
      profit: round(num(row[c.profit])),
      profitPercentage: round(num(row[c.margin]) * 100),
      missionsTax: round(num(row[c.missionsTax])),
      volumetricWeight: 0,
      unitsPerPackage: round(num(row[c.packages])),
      source: "HISTORICO",
    });
  }

  // Una fila por período + código cliente; si se repite en el período, queda la última.
  const byKey = new Map<string, ExcelSantanderCostRow>();
  for (const row of rows) byKey.set(`${row.period}|${(row.clientCode || row.uniqueCode).toLowerCase()}`, row);
  const finalRows = [...byKey.values()];
  const byPeriod = new Map<string, number>();
  for (const row of finalRows) byPeriod.set(row.period, (byPeriod.get(row.period) || 0) + 1);
  const existing = await excelPostgres.excelSantanderCost.count({ where: { client: CLIENT } });
  console.log(`Válidas: ${rows.length}. Tras unificar duplicados: ${finalRows.length}. En blanco: ${skippedBlank}. Ya cargadas de ${CLIENT}: ${existing}.`);
  console.log("Por período:", Object.fromEntries([...byPeriod.entries()].sort()));
  console.log("Sin precio de venta:", finalRows.filter((row) => !row.pvcNoVat).length, "| sin código único:", finalRows.filter((row) => !row.uniqueCode).length);
  console.log("Ejemplo:", JSON.stringify(finalRows[0]));
  if (dryRun) {
    console.log("Dry run: no se escribió nada en la base.");
    return;
  }
  await excelPostgres.$transaction(
    async (transaction) => {
      for (const row of finalRows) {
        await transaction.excelSantanderCost.deleteMany({
          where: {
            client: row.client, period: row.period,
            ...(row.clientCode ? { clientCode: { equals: row.clientCode, mode: "insensitive" } } : { uniqueCode: row.uniqueCode }),
          },
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
  );
  console.log(`OK. ${finalRows.length} filas de ${CLIENT} cargadas en la estructura de costos.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
