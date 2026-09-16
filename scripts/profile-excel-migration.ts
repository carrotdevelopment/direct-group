import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import * as XLSX from "xlsx";

loadEnvConfig(process.cwd());

type Row = Record<string, unknown>;

type SheetProfile = {
  file: string;
  sheet: string;
  rows: number;
  columns: number;
  formulas: number;
  excelErrors: number;
  checksum: string;
};

const folder = process.env.DG_LOCAL_DB_DIR;
if (!folder) throw new Error("DG_LOCAL_DB_DIR no esta configurada");

const resolvedFolder = path.resolve(folder);

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function value(row: Row, header: string) {
  const target = normalize(header);
  const key = Object.keys(row).find((candidate) => normalize(candidate) === target);
  return key ? row[key] : undefined;
}

function asText(input: unknown) {
  return String(input ?? "").trim();
}

function readWorkbook(file: string) {
  const filePath = path.join(resolvedFolder, file);
  const buffer = fs.readFileSync(filePath);
  return {
    filePath,
    checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
    workbook: XLSX.read(buffer, { type: "buffer", cellDates: false, cellFormula: true }),
  };
}

function readRows(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`No existe la hoja "${sheetName}"`);
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: "", raw: true });
}

function countDuplicates(rows: Row[], header: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = normalize(value(row, header));
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1);
}

function distinctInvalidBooleans(rows: Row[], headers: string[]) {
  const accepted = new Set(["", "SI", "SÍ", "NO", "TRUE", "FALSE", "1", "0"]);
  const invalid = new Map<string, Set<string>>();
  for (const header of headers) {
    for (const row of rows) {
      const raw = asText(value(row, header));
      const normalized = normalize(raw);
      if (!accepted.has(normalized)) {
        const values = invalid.get(header) ?? new Set<string>();
        values.add(raw);
        invalid.set(header, values);
      }
    }
  }
  return [...invalid.entries()].map(([header, values]) => ({
    header,
    values: [...values].slice(0, 10),
  }));
}

function countInvalidNumbers(rows: Row[], headers: string[]) {
  return headers
    .map((header) => ({
      header,
      invalid: rows.filter((row) => {
        const raw = value(row, header);
        if (raw === "" || raw == null) return false;
        if (typeof raw === "number") return !Number.isFinite(raw);
        const parsed = Number(asText(raw).replace(/\./g, "").replace(",", "."));
        return !Number.isFinite(parsed);
      }).length,
    }))
    .filter(({ invalid }) => invalid > 0);
}

function profileSheet(file: string, sheetName: string, checksum: string, workbook: XLSX.WorkBook) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`No existe ${file} / ${sheetName}`);
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  let formulas = 0;
  let excelErrors = 0;
  for (const cell of Object.values(sheet)) {
    if (!cell || typeof cell !== "object" || Array.isArray(cell)) continue;
    const typedCell = cell as XLSX.CellObject;
    if (typedCell.f) formulas += 1;
    if (typedCell.t === "e") excelErrors += 1;
  }
  return {
    file,
    sheet: sheetName,
    rows: Math.max(0, range.e.r - range.s.r),
    columns: range.e.c - range.s.c + 1,
    formulas,
    excelErrors,
    checksum,
  } satisfies SheetProfile;
}

const workbooks = new Map<string, ReturnType<typeof readWorkbook>>();
function getWorkbook(file: string) {
  const existing = workbooks.get(file);
  if (existing) return existing;
  const loaded = readWorkbook(file);
  workbooks.set(file, loaded);
  return loaded;
}

const sources = [
  ["Base Categorias DG.xlsx", "Categorias"],
  ["Base Clientes DG.xlsx", "Clientes"],
  ["Base Proveedores DG.xlsx", "Proveedores"],
  ["Base Productos DG.xlsx", "Productos"],
  ["Base Codigo Cliente DG.xlsx", "Codigos Cliente"],
  ["Base Config Tasas Clientes DG.xlsx", "Tasas"],
  ["Base Precios DG.xlsx", "Precios"],
  ["Base Ingresos DG.xlsx", "Ingresos"],
  ["Base Egresos Santander DG.xlsx", "Santander"],
  ["Base Estructura Costos Santander DG.xlsx", "Santander"],
  ["Base Stock Santander DG.xlsx", "Santander"],
  ["Consulta ingresos Tango.xlsx", "DB_Clientes 1"],
  ["Consulta ingresos Tango.xlsx", "Consulta1"],
] as const;

const profiles = sources.map(([file, sheet]) => {
  const loaded = getWorkbook(file);
  return profileSheet(file, sheet, loaded.checksum, loaded.workbook);
});

const optionalFreight = getWorkbook("Base Estructura Costos Santander DG.xlsx");
if (optionalFreight.workbook.Sheets["Criterios Flete"]) {
  profiles.push(
    profileSheet(
      "Base Estructura Costos Santander DG.xlsx",
      "Criterios Flete",
      optionalFreight.checksum,
      optionalFreight.workbook,
    ),
  );
}

const categories = readRows(getWorkbook("Base Categorias DG.xlsx").workbook, "Categorias");
const suppliers = readRows(getWorkbook("Base Proveedores DG.xlsx").workbook, "Proveedores");
const clients = readRows(getWorkbook("Base Clientes DG.xlsx").workbook, "Clientes");
const products = readRows(getWorkbook("Base Productos DG.xlsx").workbook, "Productos");
const clientCodes = readRows(getWorkbook("Base Codigo Cliente DG.xlsx").workbook, "Codigos Cliente");
const prices = readRows(getWorkbook("Base Precios DG.xlsx").workbook, "Precios");

const categoryNames = new Set(categories.map((row) => normalize(value(row, "Categoria"))).filter(Boolean));
const supplierNames = new Set(suppliers.map((row) => normalize(value(row, "Proveedor"))).filter(Boolean));
const clientNames = new Set(clients.map((row) => normalize(value(row, "Nombre"))).filter(Boolean));
const productCodes = new Set(products.map((row) => normalize(value(row, "Codigo Unico"))).filter(Boolean));

const relationIssues = {
  productsWithoutCategory: products.filter(
    (row) => asText(value(row, "Categoria")) && !categoryNames.has(normalize(value(row, "Categoria"))),
  ).length,
  productsWithoutSupplier: products.filter(
    (row) => asText(value(row, "Proveedor")) && !supplierNames.has(normalize(value(row, "Proveedor"))),
  ).length,
  clientCodesWithoutClient: clientCodes.filter(
    (row) => asText(value(row, "Cliente")) && !clientNames.has(normalize(value(row, "Cliente"))),
  ).length,
  clientCodesWithoutProduct: clientCodes.filter(
    (row) => asText(value(row, "Codigo Unico")) && !productCodes.has(normalize(value(row, "Codigo Unico"))),
  ).length,
  pricesWithoutSupplier: prices.filter(
    (row) => asText(value(row, "Proveedor")) && !supplierNames.has(normalize(value(row, "Proveedor"))),
  ).length,
  pricesWithoutProduct: prices.filter(
    (row) => asText(value(row, "Codigo Unico")) && !productCodes.has(normalize(value(row, "Codigo Unico"))),
  ).length,
};

const duplicateKeys = {
  categoryLegacyIds: countDuplicates(categories, "ID").length,
  categoryNames: countDuplicates(categories, "Categoria").length,
  supplierLegacyIds: countDuplicates(suppliers, "ID").length,
  supplierNames: countDuplicates(suppliers, "Proveedor").length,
  clientLegacyIds: countDuplicates(clients, "ID").length,
  clientNames: countDuplicates(clients, "Nombre").length,
  productLegacyIds: countDuplicates(products, "ID").length,
  productUniqueCodes: countDuplicates(products, "Codigo Unico").length,
};

const duplicateExamples = {
  supplierLegacyIds: countDuplicates(suppliers, "ID").slice(0, 10),
  supplierNames: countDuplicates(suppliers, "Proveedor").slice(0, 10),
  productLegacyIds: countDuplicates(products, "ID").slice(0, 10),
  productUniqueCodes: countDuplicates(products, "Codigo Unico").slice(0, 10),
};

const relationExamples = {
  productCategoriesNotFound: [
    ...new Set(
      products
        .filter(
          (row) =>
            asText(value(row, "Categoria")) &&
            !categoryNames.has(normalize(value(row, "Categoria"))),
        )
        .map((row) => asText(value(row, "Categoria"))),
    ),
  ].slice(0, 20),
  priceProductCodesNotFound: [
    ...new Set(
      prices
        .filter(
          (row) =>
            asText(value(row, "Codigo Unico")) &&
            !productCodes.has(normalize(value(row, "Codigo Unico"))),
        )
        .map((row) => asText(value(row, "Codigo Unico"))),
    ),
  ].slice(0, 20),
};

const invalidBooleans = [
  ...distinctInvalidBooleans(categories, ["Activo"]),
  ...distinctInvalidBooleans(suppliers, ["Activo"]),
  ...distinctInvalidBooleans(clients, ["Activo"]),
  ...distinctInvalidBooleans(clientCodes, ["Activo"]),
];

const invalidNumbers = [
  ...countInvalidNumbers(products, ["Bulto"]),
  ...countInvalidNumbers(prices, ["Dia", "Mes", "Año", "Costo DG", "IVA", "Precio Publico", "Mark Up"]),
  ...countInvalidNumbers(
    readRows(getWorkbook("Base Ingresos DG.xlsx").workbook, "Ingresos"),
    ["Cantidad", "Entregado"],
  ),
  ...countInvalidNumbers(
    readRows(getWorkbook("Consulta ingresos Tango.xlsx").workbook, "Consulta1"),
    ["Cantidad", "Entregado"],
  ),
];

console.log("\nFUENTES");
for (const profile of profiles) {
  console.log(
    `${profile.file} / ${profile.sheet}: ${profile.rows} filas, ${profile.columns} columnas, ` +
      `${profile.formulas} formulas, ${profile.excelErrors} errores Excel`,
  );
}

console.log("\nDUPLICADOS DE CLAVES");
console.log(JSON.stringify(duplicateKeys, null, 2));
console.log("Ejemplos:", JSON.stringify(duplicateExamples, null, 2));
console.log("\nRELACIONES SIN CORRESPONDENCIA");
console.log(JSON.stringify(relationIssues, null, 2));
console.log("Ejemplos:", JSON.stringify(relationExamples, null, 2));
console.log("\nBOOLEANOS NO RECONOCIDOS");
console.log(JSON.stringify(invalidBooleans, null, 2));
console.log("\nNUMEROS NO RECONOCIDOS");
console.log(JSON.stringify(invalidNumbers, null, 2));

const hasBlockingIssues =
  invalidBooleans.length > 0 ||
  invalidNumbers.length > 0 ||
  profiles.some((profile) => profile.excelErrors > 0);

const hasWarnings =
  Object.values(duplicateKeys).some((count) => count > 0) ||
  Object.values(relationIssues).some((count) => count > 0);

if (hasBlockingIssues) {
  console.error("\nPerfil completado con errores bloqueantes de tipo o de Excel.");
  process.exitCode = 2;
} else if (hasWarnings) {
  console.log("\nPerfil completado con observaciones no bloqueantes contempladas por el importador.");
} else {
  console.log("\nPerfil completado sin observaciones bloqueantes.");
}
