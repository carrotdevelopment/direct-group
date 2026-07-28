import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { normalizeForDuplicateCheck } from "@/lib/normalize";

export type ExcelProduct = {
  id: string;
  code: string;
  name: string;
  brand: string;
  supplier: string;
  supplierCode: string;
  category: string;
  unitsPerPackage: number | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ExcelClientCodeMapping = {
  id: string;
  client: string;
  uniqueCode: string;
  clientCode: string;
  assignedMonth: number;
  assignedYear: number;
  active: boolean;
  reactivatedAt?: string;
  correctedAt?: string;
  correctionReason?: string;
  voidedAt?: string;
  voidReason?: string;
};

export type ExcelSupplier = {
  id: string;
  name: string;
  active: boolean;
};

export type ExcelCategory = {
  id: string;
  name: string;
  active: boolean;
};

export type ExcelPrice = {
  id: string;
  supplier: string;
  uniqueCode: string;
  informedAt: string;
  costDg: number;
  vatRate: number;
  publicPrice: number;
  markup: number;
};

export type ExcelSantanderCostRow = {
  client: string;
  period: string;
  month: number;
  year: number;
  date: string;
  clientCode: string;
  uniqueCode: string;
  costUpdated: string;
  product: string;
  supplier: string;
  category: string;
  publicPrice: number;
  vatRate: number;
  markup: number;
  ppNoVat: number;
  costDgNoVat: number;
  insurance: number;
  grossIncome: number;
  debitTax: number;
  creditTax: number;
  freightNoVat: number;
  totalCost: number;
  pvcNoVat: number;
  pvcWithVat: number;
  profit: number;
  profitPercentage: number;
  missionsTax: number;
  volumetricWeight: number;
  unitsPerPackage: number;
  source: string;
};

export type ExcelClient = {
  id: string;
  name: string;
  active: boolean;
  createdAt?: string;
};

export type ExcelClientRateItem = {
  id: string;
  clientId: string;
  clientName: string;
  effectiveFrom: string;
  rateName: string;
  rateKey: string;
  applies: boolean;
  valuePct: number;
  appliesTo: "COSTO" | "PRECIO";
  sortOrder: number;
  createdAt?: string;
};

export type ExcelSantanderStockRow = {
  client: string;
  group: string;
  comments: string;
  clientCode: string;
  uniqueCode: string;
  product: string;
  supplier: string;
  category: string;
  totalOrder: number;
  physicalIncome: number;
  egress: number;
  theoreticalStock: number;
  realStock: number;
  pendingDeliveries: number;
  totalTransactions: number;
  firstIncomeDate: string;
  reportedStock: number;
  webAvailable: number;
  adjustment: number;
  validity: number;
  transactionsPerDay: number;
  stockDays: number;
  requiredStock: number;
  surplusShortage: number;
  surplusShortageByPackage: number;
  percentage: number;
  quantity: number;
  packageSize: number;
  finalPurchase: number;
  costDgNoVat: number;
  totalCost: number;
  stockValue: number;
  unitProfit: number;
  totalProfit: number;
  salePrice: number;
  remaining: number;
};

type ExcelCache<T> = {
  filePath: string;
  mtimeMs: number;
  rows: T[];
};

let clientCodesCache: ExcelCache<ExcelClientCodeMapping> | null = null;
let pricesCache: ExcelCache<ExcelPrice> | null = null;

const productsSeed: ExcelProduct[] = [
  {
    id: "example-421000005",
    code: "421000005",
    name: "Freidora Air 5 AF2050 Smart tek (421000005)",
    brand: "Smart Teck",
    supplier: "ACEGAME",
    supplierCode: "421000005",
    category: "ELECTRODOMESTICOS",
    unitsPerPackage: 1,
  },
  {
    id: "example-425000031",
    code: "425000031",
    name: "Plancha a vapor GS1500 Smart Tek (425000031)",
    brand: "Smart Teck",
    supplier: "ACEGAME",
    supplierCode: "425000031",
    category: "ELECTRODOMESTICOS",
    unitsPerPackage: 6,
  },
  {
    id: "example-191210001",
    code: "191210001",
    name: "Auriculares Bluetooth Xpods1 X-View (191210001)",
    brand: "X-View",
    supplier: "ACEGAME",
    supplierCode: "191210001",
    category: "ELECTRONICA",
    unitsPerPackage: null,
  },
  {
    id: "example-142200007",
    code: "142200007",
    name: "Tablet Titanium Colors Max X-View (142200007)",
    brand: "X-View",
    supplier: "ACEGAME",
    supplierCode: "142200007",
    category: "ELECTRONICA",
    unitsPerPackage: null,
  },
  {
    id: "example-191220000",
    code: "191220000",
    name: "Parlante Blast x3 X-View (191220000)",
    brand: "X-View",
    supplier: "ACEGAME",
    supplierCode: "191220000",
    category: "ELECTRONICA",
    unitsPerPackage: null,
  },
  {
    id: "example-142200009",
    code: "142200009",
    name: "Tablet Tungsten Max 10 X-View (142200009)",
    brand: "X-View",
    supplier: "ACEGAME",
    supplierCode: "142200009",
    category: "ELECTRONICA",
    unitsPerPackage: 6,
  },
];

const clientCodeSeed: ExcelClientCodeMapping[] = [
  {
    id: "assign-macro-421000005-2026-1",
    client: "Macro",
    uniqueCode: "421000005",
    clientCode: "MAC-421000005",
    assignedMonth: 1,
    assignedYear: 2026,
    active: true,
  },
  {
    id: "assign-provincia-425000031-2026-1",
    client: "Provincia",
    uniqueCode: "425000031",
    clientCode: "PROV-425000031",
    assignedMonth: 1,
    assignedYear: 2026,
    active: true,
  },
];

const supplierNamesSeed = [
  "ACEGAME",
  "ARBERG SRL",
  "ARGENPROV",
  "ARGENTINA",
  "ARIMEX",
  "BARALDO",
  "BARROMAN",
  "BEBIDAS SUR",
  "BECHER",
  "BIDCOM",
  "BOWIE",
  "CANDY",
  "HOGAR Y TEC",
  "CCAGRO Y TEC",
  "CINCAM",
  "CLUR",
  "COMERCIAL",
  "DECO MOS",
  "DECORATIO",
  "DIFFUPAR",
  "DOMAINE BO",
  "DUFF",
  "ELECTROLUX",
  "EXTERNAL M",
  "FASHION CO",
  "FIRST RATE",
  "FUSION",
  "GENERATION",
  "GOLDMUND",
  "GORSH",
  "GREENSTYLE",
  "GRUPO PEÃ‘A",
  "SUPIMA",
  "HOME COLLE",
  "KAMADO",
  "KANALU",
  "KEE & GO",
  "KREKER",
  "LAGARDE",
  "LILIANA",
  "LW GROUP",
  "M Y F",
  "MACCHIATO",
  "MASSIGOGE",
  "MEGAVOX",
  "MONTAGNE",
  "NATURAL SH",
  "NESTLE",
  "PANDY TOYS",
  "PAPA STUDIO",
  "WESPYT",
  "PARK DESING",
  "PHILIPS DA",
  "PHILIPS PH",
  "PHILIPS TV",
  "PILISAR",
  "RAYOVAC",
  "REDNET",
  "ROMALDI",
  "SIELEN",
  "SILGAR",
  "SILVESTRIN",
  "SOMECO",
  "SOUTH AMER",
  "SYEMED",
  "TECNOSTOR",
  "TENACTA",
  "TEST PROV",
  "TOPTIMES",
  "TRAMONTIN",
  "TUPPERWAR",
  "ULTRALIGHT",
  "VISUAR",
  "VMP",
  "VOLF",
  "WOLF DANIE",
  "ZECAT",
  "GUTEXPRO",
  "HDC INTERNA",
  "SONY",
  "CAFFETTINO",
  "BREMEN TOO",
  "BIGBOX",
  "CAVE EXTREM",
  "CRECIENDO",
  "OH GIFT CAR",
  "WORLD SPO",
  "WSB TECHNO",
  "SIMMONS",
  "CODINI",
  "LILUS TEC",
  "SODASTREAM",
  "CATALINA TA",
  "MIJO",
  "IMPO MUNR",
  "VARGAS",
  "FRAVEGA",
  "SORMIA",
  "H.D.C INTERN",
  "CARRIER SRL",
  "MIDEA",
  "H.D.C. INTER",
  "94FR60ARBP",
  "NEWSAN",
  "IMPORTADO",
  "MK2N3LE/A",
  "DONACION1",
  "DONACION",
  "DONACION3",
  "KT155",
  "LMR DEPORT",
  "KADDY SRL",
  "GENERATION",
  "HOGAR Y TEC",
  "GENERATIONS",
  "NEXINA",
  "LÃœSQTOFF",
  "POLARBOX",
  "THERMOMIX",
  "THE WELLNE",
  "AGROYTEC",
  "LÃœSQTOF",
  "BODEGAS ES",
];

const suppliersSeed: ExcelSupplier[] = Array.from(new Set(supplierNamesSeed))
  .sort((left, right) => left.localeCompare(right, "es"))
  .map((name) => ({
    id: `supplier-${name.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`,
    name,
    active: true,
  }));

const categoryNamesSeed = [
  "ELECTRODOMESTICOS",
  "ELECTRONICA",
  "INFANCIA",
  "BAZAR",
  "AIRE LIBRE",
  "HOGAR",
  "CUIDADO PERSONAL",
  "HERRAMIENTAS",
  "BLANQUERIA",
  "LINEA BLANCA",
  "VINOTECA",
  "TEST_CATEGORIA",
  "TIEMPO LIBRE",
  "PILISAR",
  "SIELEN",
  "DONACION",
  "DONACION2",
  "GENERATION",
];

const categoriesSeed: ExcelCategory[] = Array.from(new Set(categoryNamesSeed))
  .sort((left, right) => left.localeCompare(right, "es"))
  .map((name) => ({
    id: `category-${name.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`,
    name,
    active: true,
  }));

export function getLocalDbFolder() {
  return (
    process.env.DG_LOCAL_DB_DIR ||
    path.resolve(process.cwd(), "local-data", "BASE DE DATOS DG") ||
    path.resolve(process.cwd(), "..", "..", "BASE DE DATOS DG")
  );
}

function ensureFolder() {
  const folder = getLocalDbFolder();
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

export function getProductsFilePath() {
  return path.join(ensureFolder(), "Base Productos DG.xlsx");
}

export function getClientCodesFilePath() {
  return path.join(ensureFolder(), "Base Codigo Cliente DG.xlsx");
}

export function getSuppliersFilePath() {
  return path.join(ensureFolder(), "Base Proveedores DG.xlsx");
}

export function getCategoriesFilePath() {
  return path.join(ensureFolder(), "Base Categorias DG.xlsx");
}

export function getPricesFilePath() {
  return path.join(ensureFolder(), "Base Precios DG.xlsx");
}

function getPricesJsonFilePath() {
  return path.join(ensureFolder(), "Base Precios DG.json");
}

export function getClientsFilePath() {
  return path.join(ensureFolder(), "Base Clientes DG.xlsx");
}

export function getClientRatesFilePath() {
  return path.join(ensureFolder(), "Base Config Tasas Clientes DG.xlsx");
}

export function getSantanderCostStructureFilePath() {
  return path.join(ensureFolder(), "Base Estructura Costos Santander DG.xlsx");
}

export function getFreightCriteriaFilePath() {
  return path.join(ensureFolder(), "Base Criterios Flete DG.json");
}

export function getSantanderStockFilePath() {
  return path.join(ensureFolder(), "Base Stock Santander DG.xlsx");
}

function readSheetRows(filePath: string) {
  const workbook = XLSX.read(fs.readFileSync(filePath), {
    type: "buffer",
    cellDates: false,
  });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
}

function writeWorkbook(
  filePath: string,
  sheetName: string,
  rows: Record<string, unknown>[],
) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
  fs.writeFileSync(filePath, buffer);
}

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function asNullableNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const raw = String(value ?? "")
    .trim()
    .replace(/[^\d,.-]/g, "");
  if (!raw) return null;
  let normalized = raw;
  if (raw.includes(".") && raw.includes(",")) {
    normalized =
      raw.lastIndexOf(",") > raw.lastIndexOf(".")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/,/g, "");
  } else if (/^\d{1,3}(,\d{3})+$/.test(raw)) {
    normalized = raw.replace(/,/g, "");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, "");
  } else {
    normalized = raw.replace(",", ".");
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function asNumber(value: unknown) {
  return asNullableNumber(value) ?? 0;
}

function normalizePercentRate(value: unknown) {
  const number = asNumber(value);
  if (number > 1 && number <= 3) return (number - 1) * 100;
  if (number > 0 && number <= 1) return number * 100;
  return number;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateMarkup(costDg: number, vatRate: number, publicPrice: number) {
  if (!costDg || !publicPrice) return 0;
  const netPublicPrice = publicPrice / (1 + vatRate / 100);
  return roundMoney(((netPublicPrice - costDg) / costDg) * 100);
}

function toIsoDate(year: number, month: number, day: number) {
  if (!year || !month || !day) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function asIsoDateTime(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const raw = asString(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function withUniquePriceIds(prices: ExcelPrice[]) {
  const seen = new Map<string, number>();
  return prices.map((price, index) => {
    const baseId =
      price.id ||
      `excel-price-${price.informedAt}-${price.uniqueCode || index}`;
    const count = seen.get(baseId) ?? 0;
    seen.set(baseId, count + 1);
    const normalizedPrice = {
      ...price,
      markup:
        price.costDg && price.publicPrice
          ? calculateMarkup(
              price.costDg,
              price.vatRate || 21,
              price.publicPrice,
            )
          : price.markup,
    };
    return count === 0
      ? { ...normalizedPrice, id: baseId }
      : { ...normalizedPrice, id: `${baseId}-${count + 1}` };
  });
}

export function readProductsFromExcel() {
  const filePath = getProductsFilePath();
  if (!fs.existsSync(filePath)) writeProductsToExcel(productsSeed);
  const rows = readSheetRows(filePath);
  return rows
    .map((row, index): ExcelProduct => {
      const code = asString(
        row["Código Único"] ||
          row["CÃ³digo Ãšnico"] ||
          row["Codigo Unico"] ||
          row["Codigo Único"] ||
          row["code"],
      );
      return {
        id: asString(row["ID"]) || `excel-product-${code || index}`,
        code,
        name: asString(
          row["Producto"] || row["Nombre Producto"] || row["name"],
        ),
        brand: asString(row["Marca"] || row["brand"]),
        supplier: asString(row["Proveedor"] || row["supplier"]),
        supplierCode: asString(
          row["Cód. Único Prov."] ||
            row["CÃ³d. Ãšnico Prov."] ||
            row["Cod. Unico Prov."] ||
            row["Cod. Único Prov."] ||
            row["supplierCode"],
        ),
        category: asString(
          row["Categoría"] ||
            row["CategorÃ­a"] ||
            row["Categoria"] ||
            row["category"],
        ),
        unitsPerPackage: asNullableNumber(
          row["Bulto"] || row["unitsPerPackage"],
        ),
        createdAt: asIsoDateTime(row["Creado"] || row["createdAt"]),
        updatedAt: asIsoDateTime(row["Actualizado"] || row["updatedAt"]),
      };
    })
    .filter((product) => product.code && product.name);
}

export function writeProductsToExcel(products: ExcelProduct[]) {
  const filePath = getProductsFilePath();
  writeWorkbook(
    filePath,
    "Productos",
    products.map((product) => ({
      ID: product.id,
      Producto: product.name,
      Marca: product.brand,
      "Código Único": product.code,
      "Cód. Único Prov.": product.supplierCode,
      Proveedor: product.supplier,
      Categoria: product.category,
      Bulto: product.unitsPerPackage ?? "",
      Creado: product.createdAt ?? "",
      Actualizado: product.updatedAt ?? "",
    })),
  );
  return filePath;
}

export function readClientCodesFromExcel() {
  const filePath = getClientCodesFilePath();
  if (!fs.existsSync(filePath)) writeClientCodesToExcel(clientCodeSeed);
  const mtimeMs = fs.statSync(filePath).mtimeMs;
  if (
    clientCodesCache &&
    clientCodesCache.filePath === filePath &&
    clientCodesCache.mtimeMs === mtimeMs
  ) {
    return clientCodesCache.rows;
  }

  const rows = readSheetRows(filePath);
  const mappings = rows
    .map((row, index): ExcelClientCodeMapping => {
      const client = asString(row["Cliente"]);
      const uniqueCode = asString(
        row["Código Único"] ||
          row["CÃ³digo Ãšnico"] ||
          row["Codigo Unico"] ||
          row["Codigo Único"],
      );
      const clientCode = asString(
        row["Código Cliente"] ||
          row["CÃ³digo Cliente"] ||
          row["Codigo Cliente"],
      );
      // New column names with fallback to old names for backward compatibility
      const assignedMonth = Number(
        asString(
          row["Mes Asignación"] || row["Mes Asignacion"] || row["Mes"],
        ) || "0",
      );
      const assignedYear = Number(
        asString(
          row["Año Asignación"] ||
            row["Anio Asignacion"] ||
            row["Año"] ||
            row["Anio"],
        ) || "0",
      );
      const activeStr = asString(row["Activo"] || row["active"]).toLowerCase();
      const active = activeStr === "" ? true : activeStr !== "no";
      return {
        id:
          asString(row["ID"]) ||
          `assign-${client}-${uniqueCode}-${assignedYear}-${assignedMonth}-${index}`,
        client,
        uniqueCode,
        clientCode,
        assignedMonth,
        assignedYear,
        active,
        reactivatedAt: asIsoDateTime(row["Reactivado"] || row["reactivatedAt"]),
        correctedAt: asIsoDateTime(row["Corregido"] || row["correctedAt"]),
        correctionReason: asString(
          row["Motivo Corrección"] ||
            row["Motivo Correccion"] ||
            row["correctionReason"],
        ),
        voidedAt: asIsoDateTime(row["Anulado"] || row["voidedAt"]),
        voidReason: asString(
          row["Motivo Anulación"] ||
            row["Motivo Anulacion"] ||
            row["voidReason"],
        ),
      };
    })
    .filter(
      (mapping) =>
        mapping.client &&
        mapping.assignedMonth >= 1 &&
        mapping.assignedMonth <= 12 &&
        mapping.assignedYear > 2000 &&
        mapping.uniqueCode &&
        mapping.clientCode,
    );

  clientCodesCache = {
    filePath,
    mtimeMs,
    rows: mappings,
  };

  return mappings;
}

export function writeClientCodesToExcel(mappings: ExcelClientCodeMapping[]) {
  const filePath = getClientCodesFilePath();
  writeWorkbook(
    filePath,
    "Codigos Cliente",
    mappings.map((mapping) => ({
      ID: mapping.id,
      Cliente: mapping.client,
      "Código Único": mapping.uniqueCode,
      "Código Cliente": mapping.clientCode,
      "Mes Asignación": mapping.assignedMonth,
      "Año Asignación": mapping.assignedYear,
      Activo: mapping.active ? "Si" : "No",
      Reactivado: mapping.reactivatedAt ?? "",
      Corregido: mapping.correctedAt ?? "",
      "Motivo Corrección": mapping.correctionReason ?? "",
      Anulado: mapping.voidedAt ?? "",
      "Motivo Anulación": mapping.voidReason ?? "",
    })),
  );
  clientCodesCache = {
    filePath,
    mtimeMs: fs.statSync(filePath).mtimeMs,
    rows: mappings,
  };
  return filePath;
}

export function readSuppliersFromExcel() {
  const filePath = getSuppliersFilePath();
  if (!fs.existsSync(filePath)) writeSuppliersToExcel(suppliersSeed);
  const rows = readSheetRows(filePath);
  return rows
    .map((row, index): ExcelSupplier => {
      const name = asString(row["Proveedor"] || row["Nombre"] || row["name"]);
      return {
        id: asString(row["ID"]) || `excel-supplier-${name || index}`,
        name,
        active: asString(row["Activo"] || row["active"]).toLowerCase() !== "no",
      };
    })
    .filter((supplier) => supplier.name);
}

export function writeSuppliersToExcel(suppliers: ExcelSupplier[]) {
  const filePath = getSuppliersFilePath();
  const uniqueSuppliers = Array.from(
    new Map(
      suppliers.map((supplier) => [
        normalizeForDuplicateCheck(supplier.name),
        { ...supplier, name: supplier.name.trim().replace(/\s+/g, " ") },
      ]),
    ).values(),
  ).filter((supplier) => supplier.name);
  writeWorkbook(
    filePath,
    "Proveedores",
    uniqueSuppliers.map((supplier) => ({
      ID: supplier.id,
      Proveedor: supplier.name,
      Activo: supplier.active ? "Si" : "No",
    })),
  );
  return filePath;
}

export function readCategoriesFromExcel() {
  const filePath = getCategoriesFilePath();
  if (!fs.existsSync(filePath)) writeCategoriesToExcel(categoriesSeed);
  const rows = readSheetRows(filePath);
  return rows
    .map((row, index): ExcelCategory => {
      const name = asString(
        row["CategorÃ­a"] || row["Categoria"] || row["Nombre"] || row["name"],
      );
      return {
        id: asString(row["ID"]) || `excel-category-${name || index}`,
        name,
        active: asString(row["Activo"] || row["active"]).toLowerCase() !== "no",
      };
    })
    .filter((category) => category.name);
}

export function writeCategoriesToExcel(categories: ExcelCategory[]) {
  const filePath = getCategoriesFilePath();
  const uniqueCategories = Array.from(
    new Map(
      categories.map((category) => [
        normalizeForDuplicateCheck(category.name),
        { ...category, name: category.name.trim().replace(/\s+/g, " ") },
      ]),
    ).values(),
  ).filter((category) => category.name);
  writeWorkbook(
    filePath,
    "Categorias",
    uniqueCategories.map((category) => ({
      ID: category.id,
      Categoria: category.name,
      Activo: category.active ? "Si" : "No",
    })),
  );
  return filePath;
}

export function readPricesFromExcel() {
  const filePath = getPricesFilePath();
  if (!fs.existsSync(filePath)) writePricesToExcel([]);
  const mtimeMs = fs.statSync(filePath).mtimeMs;
  if (
    pricesCache &&
    pricesCache.filePath === filePath &&
    pricesCache.mtimeMs === mtimeMs
  ) {
    return pricesCache.rows;
  }

  const jsonPath = getPricesJsonFilePath();
  if (fs.existsSync(jsonPath) && fs.statSync(jsonPath).mtimeMs >= mtimeMs) {
    const prices = withUniquePriceIds(
      JSON.parse(fs.readFileSync(jsonPath, "utf8")) as ExcelPrice[],
    );
    pricesCache = {
      filePath,
      mtimeMs,
      rows: prices,
    };
    return prices;
  }

  const productsByCode = new Map(
    readProductsFromExcel().map((product) => [product.code, product]),
  );

  const rows = readSheetRows(filePath);
  const prices = withUniquePriceIds(
    rows
      .map((row, index): ExcelPrice => {
        const uniqueCode = asString(
          row["Codigo Unico"] ||
            row["Código Único"] ||
            row["CÃ³digo Ãšnico"] ||
            row["Codigo Único"] ||
            row["uniqueCode"],
        );
        const year = asNumber(row["Año"] || row["AÃ±o"] || row["Anio"]);
        const month = asNumber(row["Mes"]);
        const day = asNumber(row["Día"] || row["DÃ­a"] || row["Dia"]);
        const informedAt =
          asString(row["Fecha"] || row["informedAt"]) ||
          toIsoDate(year, month, day);
        const product = productsByCode.get(uniqueCode);

        return {
          id: asString(row["ID"]) || `excel-price-${uniqueCode || index}`,
          supplier:
            asString(row["Proveedor"] || row["supplier"]) ||
            product?.supplier ||
            "",
          uniqueCode,
          informedAt,
          costDg: asNumber(row["Costo DG"] || row["costDg"]),
          vatRate: normalizePercentRate(row["IVA"] || row["vatRate"]),
          publicPrice: asNumber(
            row["Precio Publico"] ||
              row["Precio Público"] ||
              row["publicPrice"],
          ),
          markup: normalizePercentRate(row["Mark Up"] || row["markup"]),
        };
      })
      .filter((price) => price.uniqueCode && price.informedAt),
  );

  pricesCache = {
    filePath,
    mtimeMs,
    rows: prices,
  };
  fs.writeFileSync(jsonPath, JSON.stringify(prices));

  return prices;
}

export function writePricesToExcel(prices: ExcelPrice[]) {
  const filePath = getPricesFilePath();
  const uniquePrices = withUniquePriceIds(prices);
  writeWorkbook(
    filePath,
    "Precios",
    uniquePrices.map((price) => {
      const [year, month, day] = price.informedAt.split("-");
      return {
        ID: price.id,
        Proveedor: price.supplier,
        "Codigo Unico": price.uniqueCode,
        Día: Number(day) || "",
        Mes: Number(month) || "",
        Año: Number(year) || "",
        "Costo DG": price.costDg,
        IVA: price.vatRate,
        "Precio Publico": price.publicPrice,
        "Mark Up": price.markup,
      };
    }),
  );
  pricesCache = {
    filePath,
    mtimeMs: fs.statSync(filePath).mtimeMs,
    rows: uniquePrices,
  };
  fs.writeFileSync(getPricesJsonFilePath(), JSON.stringify(uniquePrices));
  return filePath;
}

export function readSantanderCostRowsFromExcel() {
  const filePath = getSantanderCostStructureFilePath();
  if (!fs.existsSync(filePath)) return [];
  const rows = readSheetRows(filePath);
  return rows
    .map((row, index): ExcelSantanderCostRow => {
      const period = asString(row["Periodo"]);
      const year = Number(asString(row["Anio"] || row["Año"]) || "0");
      const month = Number(asString(row["Mes"]) || "0");
      const uniqueCode = asString(
        row["Codigo Unico"] || row["Código Único"] || row["Codigo Único"],
      );
      return {
        client: asString(row["Cliente"]) || "Santander",
        period,
        month,
        year,
        date: asString(row["Fecha"]) || `${period}-01`,
        clientCode: asString(
          row["Codigo Cliente"] ||
            row["Código Cliente"] ||
            row["CÓDIGO"] ||
            row["Codigo"],
        ),
        uniqueCode,
        costUpdated: asString(
          row["Costo Actualizado"] || row["Costo Actualizado "],
        ),
        product: asString(row["Producto"] || row["PRODUCTO"]),
        supplier: asString(row["Proveedor"] || row["PROVEEDOR"]),
        category: asString(row["Categoria"] || row["Categoría"]),
        publicPrice: asNumber(row["Precio Publico"] || row["Precio Público"]),
        vatRate: asNumber(row["IVA"]),
        markup: asNumber(row["Mark Up"]),
        ppNoVat: asNumber(row["PP s/IVA"]),
        costDgNoVat: asNumber(row["Costo DG sin iva"]),
        insurance: asNumber(row["Seguro"]),
        grossIncome: asNumber(row["Ing. Brutos"]),
        debitTax: asNumber(row["Imp. Debito"] || row["Imp. Débito"]),
        creditTax: asNumber(row["Imp. Credito"] || row["Imp. Crédito"]),
        freightNoVat: asNumber(row["Flete S/IVA"]),
        totalCost: asNumber(row["Costo Total"]),
        pvcNoVat: asNumber(row["PVC sin IVA"]),
        pvcWithVat: asNumber(row["PVC con IVA"]),
        profit: asNumber(row["Utilidad"]),
        profitPercentage: asNumber(row["Porcentaje"] || row["%"]),
        missionsTax: asNumber(row["Impuesto Misiones"]),
        volumetricWeight: asNumber(
          row["Peso Volumetrico"] || row["PESO VOLUMÉTRICO"],
        ),
        unitsPerPackage: asNumber(row["Bultos"]),
        source: asString(row["Origen"]) || `excel-${index}`,
      };
    })
    .filter(
      (row) =>
        row.client.toLowerCase() === "santander" &&
        row.period &&
        row.uniqueCode,
    );
}

export function writeSantanderCostRowsToExcel(rows: ExcelSantanderCostRow[]) {
  const filePath = getSantanderCostStructureFilePath();
  writeWorkbook(
    filePath,
    "Santander",
    rows.map((row) => ({
      Cliente: row.client,
      Periodo: row.period,
      Mes: row.month,
      Anio: row.year,
      Fecha: row.date,
      "Codigo Cliente": row.clientCode,
      "Codigo Unico": row.uniqueCode,
      "Costo Actualizado": row.costUpdated,
      Producto: row.product,
      Proveedor: row.supplier,
      Categoria: row.category,
      "Precio Publico": row.publicPrice,
      IVA: row.vatRate,
      "Mark Up": row.markup,
      "PP s/IVA": row.ppNoVat,
      "Costo DG sin iva": row.costDgNoVat,
      Seguro: row.insurance,
      "Ing. Brutos": row.grossIncome,
      "Imp. Debito": row.debitTax,
      "Imp. Credito": row.creditTax,
      "Flete S/IVA": row.freightNoVat,
      "Costo Total": row.totalCost,
      "PVC sin IVA": row.pvcNoVat,
      "PVC con IVA": row.pvcWithVat,
      Utilidad: row.profit,
      Porcentaje: row.profitPercentage,
      "Impuesto Misiones": row.missionsTax,
      "Peso Volumetrico": row.volumetricWeight,
      Bultos: row.unitsPerPackage,
      Origen: row.source,
    })),
  );
  return filePath;
}

// ── Freight criteria ──────────────────────────────────────────────────────────

export type FreightCriterionEntry = {
  mode: "pct" | "fixed";
  value: number;
  effectiveFrom: string; // "YYYY-MM"
};

type FreightCriteriaStore = Record<string, FreightCriterionEntry[]>;

export function readFreightCriteria(): FreightCriteriaStore {
  const filePath = getFreightCriteriaFilePath();
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as FreightCriteriaStore;
  } catch {
    return {};
  }
}

export function getActiveCriterion(
  entries: FreightCriterionEntry[],
  periodKey: string,
): FreightCriterionEntry | null {
  return (
    [...entries]
      .filter((e) => e.effectiveFrom <= periodKey)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null
  );
}

export function upsertFreightCriterion(
  uniqueCode: string,
  entry: FreightCriterionEntry,
): void {
  const filePath = getFreightCriteriaFilePath();
  const store = readFreightCriteria();
  const existing = store[uniqueCode] ?? [];
  const idx = existing.findIndex((e) => e.effectiveFrom === entry.effectiveFrom);
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }
  store[uniqueCode] = existing.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

export function readSantanderStockRowsFromExcel() {
  const filePath = getSantanderStockFilePath();
  if (!fs.existsSync(filePath)) return [];
  const rows = readSheetRows(filePath);
  return rows
    .map((row): ExcelSantanderStockRow => ({
      client: asString(row["Cliente"]) || "Santander",
      group: asString(row["Grupo"]),
      comments: asString(row["Comentarios"]),
      clientCode: asString(row["Codigo Cliente"] || row["Código Cliente"]),
      uniqueCode: asString(row["Codigo Unico"] || row["Código Único"]),
      product: asString(row["Producto"]),
      supplier: asString(row["Proveedor"]),
      category: asString(row["Categoria"] || row["Categoría"]),
      totalOrder: asNumber(row["Pedido Total"]),
      physicalIncome: asNumber(row["Ingreso Fisico"] || row["Ingreso Físico"]),
      egress: asNumber(row["Egreso"]),
      theoreticalStock: asNumber(row["Stock Teorico"] || row["Stock Teórico"]),
      realStock: asNumber(row["Stock Real"]),
      pendingDeliveries: asNumber(row["Entregas Pendientes"]),
      totalTransactions: asNumber(row["Transacciones Totales"]),
      firstIncomeDate: asString(row["Fecha Primer Ingreso"]),
      reportedStock: asNumber(row["Stock Informado"]),
      webAvailable: asNumber(row["Dispone WEB"]),
      adjustment: asNumber(row["Ajuste"]),
      validity: asNumber(row["Vigencia"]),
      transactionsPerDay: asNumber(row["Transacciones Por Dia"]),
      stockDays: asNumber(row["Dias de Stock"] || row["Días de Stock"]),
      requiredStock: asNumber(row["Stock Necesario"]),
      surplusShortage: asNumber(row["Sobra/Falta"]),
      surplusShortageByPackage: asNumber(row["Sobra/Falta Segun Bulto"]),
      percentage: asNumber(row["Porcentaje"] || row["%"]),
      quantity: asNumber(row["Cantidad"]),
      packageSize: asNumber(row["Bulto"]),
      finalPurchase: asNumber(row["Compra Final"]),
      costDgNoVat: asNumber(row["Costo DG S/IVA"]),
      totalCost: asNumber(row["Total Costo"]),
      stockValue: asNumber(row["Stock Valorizado"]),
      unitProfit: asNumber(row["Utilidad Unitaria"]),
      totalProfit: asNumber(row["Utilidad Total"]),
      salePrice: asNumber(row["PV"]),
      remaining: asNumber(row["Restantes"]),
    }))
    .filter(
      (row) =>
        row.client.toLowerCase() === "santander" &&
        (row.clientCode || row.uniqueCode),
    );
}

const clientNamesSeed = [
  "Macro", "Provincia", "Producteca", "Credicoop REG", "HSBC", "Santander",
  "Credicoop ES", "Massalin", "Pampa", "CTC", "Supervielle", "Amex Futuro",
  "Amex", "Comafi", "Importados", "Syngenta", "Umiles",
];

const clientsSeed: ExcelClient[] = clientNamesSeed.map((name) => ({
  id: `client-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  name,
  active: true,
}));

const defaultRateItems: Omit<ExcelClientRateItem, "id" | "clientId" | "clientName" | "effectiveFrom" | "createdAt">[] = [
  { rateName: "Seguro",        rateKey: "seguro",             applies: true, valuePct: 1.2,  appliesTo: "COSTO",  sortOrder: 1 },
  { rateName: "Ing. Brutos",   rateKey: "ingresos_brutos",    applies: true, valuePct: 5,    appliesTo: "PRECIO", sortOrder: 2 },
  { rateName: "Imp. Débito",   rateKey: "impuesto_debito",    applies: true, valuePct: 0.6,  appliesTo: "PRECIO", sortOrder: 3 },
  { rateName: "Imp. Crédito",  rateKey: "impuesto_credito",   applies: true, valuePct: 0.6,  appliesTo: "PRECIO", sortOrder: 4 },
  { rateName: "Imp. Misiones", rateKey: "impuesto_misiones",  applies: true, valuePct: 1.25, appliesTo: "PRECIO", sortOrder: 5 },
];

function buildClientRatesSeed(): ExcelClientRateItem[] {
  const effectiveFrom = "2024-01";
  const items: ExcelClientRateItem[] = [];
  for (const client of clientsSeed) {
    for (const rate of defaultRateItems) {
      items.push({
        id: `rate-${client.id}-${rate.rateKey}-${effectiveFrom}`,
        clientId: client.id,
        clientName: client.name,
        effectiveFrom,
        ...rate,
        createdAt: new Date().toISOString(),
      });
    }
  }
  return items;
}

export function readClientsFromExcel(): ExcelClient[] {
  const filePath = getClientsFilePath();
  if (!fs.existsSync(filePath)) writeClientsToExcel(clientsSeed);
  const rows = readSheetRows(filePath);
  return rows
    .map((row, index): ExcelClient => {
      const name = asString(row["Nombre"] || row["Cliente"]);
      return {
        id: asString(row["ID"]) || `client-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || index}`,
        name,
        active: asString(row["Activo"]).toLowerCase() !== "no",
        createdAt: asIsoDateTime(row["Creado"]),
      };
    })
    .filter((c) => c.name);
}

export function writeClientsToExcel(clients: ExcelClient[]) {
  const filePath = getClientsFilePath();
  writeWorkbook(filePath, "Clientes", clients.map((c) => ({
    ID: c.id,
    Nombre: c.name,
    Activo: c.active ? "Si" : "No",
    Creado: c.createdAt ?? new Date().toISOString(),
  })));
  return filePath;
}

export function readClientRatesFromExcel(): ExcelClientRateItem[] {
  const filePath = getClientRatesFilePath();
  if (!fs.existsSync(filePath)) writeClientRatesToExcel(buildClientRatesSeed());
  const rows = readSheetRows(filePath);
  return rows
    .map((row, index): ExcelClientRateItem => {
      const appliesTo = asString(row["Aplica Sobre"]).toUpperCase();
      return {
        id: asString(row["ID"]) || `rate-item-${index}`,
        clientId: asString(row["Cliente ID"]),
        clientName: asString(row["Cliente"]),
        effectiveFrom: asString(row["Vigente Desde"]),
        rateName: asString(row["Nombre Tasa"]),
        rateKey: asString(row["Clave"]),
        applies: asString(row["Aplica"]).toLowerCase() !== "no",
        valuePct: asNumber(row["Valor %"]),
        appliesTo: appliesTo === "COSTO" ? "COSTO" : "PRECIO",
        sortOrder: asNumber(row["Orden"]) || 99,
        createdAt: asIsoDateTime(row["Creado"]),
      };
    })
    .filter((r) => r.clientId && r.rateKey && r.effectiveFrom);
}

export function writeClientRatesToExcel(items: ExcelClientRateItem[]) {
  const filePath = getClientRatesFilePath();
  writeWorkbook(filePath, "Tasas", items.map((r) => ({
    ID: r.id,
    "Cliente ID": r.clientId,
    Cliente: r.clientName,
    "Vigente Desde": r.effectiveFrom,
    "Nombre Tasa": r.rateName,
    Clave: r.rateKey,
    Aplica: r.applies ? "Si" : "No",
    "Valor %": r.valuePct,
    "Aplica Sobre": r.appliesTo,
    Orden: r.sortOrder,
    Creado: r.createdAt ?? new Date().toISOString(),
  })));
  return filePath;
}
