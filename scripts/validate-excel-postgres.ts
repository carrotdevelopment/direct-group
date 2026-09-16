import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import * as XLSX from "xlsx";
import { PrismaClient } from "../node_modules/.prisma/excel-client";

loadEnvConfig(process.cwd());

type Row = Record<string, unknown>;
type CountDelegate = { count(): Promise<number> };

const folder = process.env.DG_LOCAL_DB_DIR;
if (!folder) throw new Error("DG_LOCAL_DB_DIR no esta configurada");
if (!process.env.EXCEL_DATABASE_URL) throw new Error("EXCEL_DATABASE_URL no esta configurada");

const dataFolder = path.resolve(folder);
const prisma = new PrismaClient();
const workbookCache = new Map<string, XLSX.WorkBook>();

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function workbook(fileName: string) {
  const cached = workbookCache.get(fileName);
  if (cached) return cached;
  const loaded = XLSX.read(fs.readFileSync(path.join(dataFolder, fileName)), {
    type: "buffer",
    cellDates: false,
  });
  workbookCache.set(fileName, loaded);
  return loaded;
}

function rows(fileName: string, sheetName: string) {
  const sheet = workbook(fileName).Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: "", raw: true });
}

function value(row: Row, header: string) {
  const target = normalize(header);
  const key = Object.keys(row).find((candidate) => normalize(candidate) === target);
  return key ? row[key] : undefined;
}

function numberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let raw = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/ARS/gi, "")
    .replace(/\$/g, "")
    .replace(/%$/, "");
  if (!raw || /^[-–—]+$/.test(raw)) return null;
  const negative = /^\(.*\)$/.test(raw);
  if (negative) raw = raw.slice(1, -1);
  if (raw.includes(",") && raw.includes(".")) {
    raw = raw.lastIndexOf(",") > raw.lastIndexOf(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (raw.includes(",")) {
    raw = /^-?[1-9]\d{0,2}(,\d{3})+$/.test(raw)
      ? raw.replace(/,/g, "")
      : raw.replace(",", ".");
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

function sum(rowsToSum: Row[], header: string) {
  return rowsToSum.reduce((total, row) => total + (numberOrNull(value(row, header)) ?? 0), 0);
}

function approximatelyEqual(left: number, right: number) {
  return Math.abs(left - right) < 0.0001;
}

async function databaseCount(model: string) {
  const delegate = (prisma as unknown as Record<string, CountDelegate>)[model];
  if (!delegate) throw new Error(`Delegate Prisma desconocido: ${model}`);
  return delegate.count();
}

async function main() {
  const productRows = rows("Base Productos DG.xlsx", "Productos");
  const distinctBrands = new Set(
    productRows.map((row) => normalize(value(row, "Marca"))).filter(Boolean),
  ).size;
  const freightRows = rows("Base Estructura Costos Santander DG.xlsx", "Criterios Flete");

  const expected = [
    ["base_categorias", "excelCategory", rows("Base Categorias DG.xlsx", "Categorias").length],
    ["base_clientes", "excelClient", rows("Base Clientes DG.xlsx", "Clientes").length],
    ["base_proveedores", "excelSupplier", rows("Base Proveedores DG.xlsx", "Proveedores").length],
    ["marcas", "excelBrand", distinctBrands],
    ["base_productos", "excelProduct", productRows.length],
    ["base_codigo_cliente", "excelClientCode", rows("Base Codigo Cliente DG.xlsx", "Codigos Cliente").length],
    ["base_config_tasas_clientes", "excelClientRate", rows("Base Config Tasas Clientes DG.xlsx", "Tasas").length],
    ["base_precios", "excelPrice", rows("Base Precios DG.xlsx", "Precios").length],
    ["base_ingresos", "excelIncome", rows("Base Ingresos DG.xlsx", "Ingresos").length],
    ["base_egresos_santander", "excelSantanderEgress", rows("Base Egresos Santander DG.xlsx", "Santander").length],
    ["base_estructura_costos_santander", "excelSantanderCost", rows("Base Estructura Costos Santander DG.xlsx", "Santander").length],
    ["criterios_flete", "excelFreightCriterion", freightRows.length],
    ["base_stock_santander", "excelSantanderStock", rows("Base Stock Santander DG.xlsx", "Santander").length],
    ["tango_clientes", "tangoClient", rows("Consulta ingresos Tango.xlsx", "DB_Clientes 1").length],
    ["tango_ingresos", "tangoIncome", rows("Consulta ingresos Tango.xlsx", "Consulta1").length],
  ] as const;

  let failed = false;
  console.log("\nCONTEOS EXCEL vs POSTGRESQL");
  for (const [table, model, excelCount] of expected) {
    const sqlCount = await databaseCount(model);
    const matches = sqlCount === excelCount;
    if (!matches) failed = true;
    console.log(`${matches ? "OK" : "ERROR"} ${table}: Excel=${excelCount}, SQL=${sqlCount}`);
  }

  const completedWithRejectedRows = await prisma.excelImportBatch.count({
    where: { status: "COMPLETED", rejectedRows: { gt: 0 } },
  });
  const failedBatches = await prisma.excelImportBatch.count({ where: { status: "FAILED" } });
  console.log(`\nLotes completados con rechazos: ${completedWithRejectedRows}`);
  console.log(`Intentos fallidos auditados: ${failedBatches}`);
  if (completedWithRejectedRows > 0) failed = true;

  const unresolvedBrands = await prisma.excelProduct.count({
    where: { brandOriginal: { not: null }, brandId: null },
  });
  const unresolvedSuppliers = await prisma.excelProduct.count({
    where: { supplierOriginal: { not: null }, supplierId: null },
  });
  const unresolvedCategories = await prisma.excelProduct.count({
    where: { categoryOriginal: { not: null }, categoryId: null },
  });
  console.log("\nRELACIONES DE PRODUCTOS");
  console.log(`Marca sin resolver: ${unresolvedBrands}`);
  console.log(`Proveedor sin resolver: ${unresolvedSuppliers}`);
  console.log(`Categoria sin resolver: ${unresolvedCategories} (esperadas por el perfil: 6)`);
  if (unresolvedBrands !== 0 || unresolvedSuppliers !== 0 || unresolvedCategories !== 6) failed = true;

  const excelIncomes = rows("Base Ingresos DG.xlsx", "Ingresos");
  const sqlIncomeTotals = await prisma.excelIncome.aggregate({
    _sum: { quantity: true, deliveredQuantity: true },
  });
  const incomeQuantityExcel = sum(excelIncomes, "Cantidad");
  const incomeDeliveredExcel = sum(excelIncomes, "Entregado");
  const incomeQuantitySql = Number(sqlIncomeTotals._sum.quantity ?? 0);
  const incomeDeliveredSql = Number(sqlIncomeTotals._sum.deliveredQuantity ?? 0);

  const excelEgresses = rows("Base Egresos Santander DG.xlsx", "Santander");
  const sqlEgressTotals = await prisma.excelSantanderEgress.aggregate({ _sum: { quantity: true } });
  const egressQuantityExcel = sum(excelEgresses, "Cantidad");
  const egressQuantitySql = Number(sqlEgressTotals._sum.quantity ?? 0);
  const egressWarnings = await prisma.excelSantanderEgress.count({
    where: { migrationWarning: { not: null } },
  });

  console.log("\nTOTALES DE CONTROL");
  const controls = [
    ["Ingresos.Cantidad", incomeQuantityExcel, incomeQuantitySql],
    ["Ingresos.Entregado", incomeDeliveredExcel, incomeDeliveredSql],
    ["Egresos.Cantidad (valores numericos)", egressQuantityExcel, egressQuantitySql],
  ] as const;
  for (const [label, excelTotal, sqlTotal] of controls) {
    const matches = approximatelyEqual(excelTotal, sqlTotal);
    if (!matches) failed = true;
    console.log(`${matches ? "OK" : "ERROR"} ${label}: Excel=${excelTotal}, SQL=${sqlTotal}`);
  }
  console.log(`Advertencias preservadas en Egresos: ${egressWarnings} (esperada: 1)`);
  if (egressWarnings !== 1) failed = true;

  if (failed) {
    throw new Error("La validacion Excel vs PostgreSQL encontro diferencias no esperadas");
  }
  console.log("\nVALIDACION COMPLETA: la migracion local coincide con las fuentes Excel.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
