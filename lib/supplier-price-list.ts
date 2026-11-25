import * as XLSX from "xlsx";

// Formato de la lista de cada proveedor: en qué columnas vienen los datos que se cargan en Precios.
// Los títulos se comparan sin acentos, espacios ni signos. Para sumar un proveedor, agregar su entrada.
export type SupplierPriceFormat = {
  code: string[];
  description: string[];
  costDg: string[];
  vatRate: string[];
  publicPrice: string[];
  // Markup fijo del proveedor en % (65 = 1,65). Sin esto, se calcula con los precios.
  markup?: number;
};

const FORMATS: Record<string, SupplierPriceFormat> = {
  RAYOVAC: {
    code: ["Código SAP"],
    description: ["Descripción"],
    costDg: ["Precio Factura Sin IVA"],
    vatRate: ["IVA"],
    publicPrice: ["Precio Público"],
    markup: 65,
  },
};

export function supplierPriceFormat(supplier: string): SupplierPriceFormat | null {
  return FORMATS[supplier.trim().toUpperCase()] ?? null;
}

export type SupplierListRow = {
  sourceCode: string;
  description: string;
  costDg: number;
  vatRate: number;
  publicPrice: number;
};

export type SupplierList = {
  rows: SupplierListRow[];
  // Mes que dice el título de la lista, si lo dice.
  period: { month: number; year: number; label: string } | null;
  sheets: string[];
  warnings: string[];
};

const plain = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const compact = (value: unknown) => plain(value).replace(/[^a-z0-9]/g, "");
const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const round = (value: number, decimals: number) => Math.round((value + Number.EPSILON) * 10 ** decimals) / 10 ** decimals;

// Importe de una celda: número, o texto con formato argentino ("$ 21.718,91").
function amount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = clean(value).replace(/[$\s]/g, "");
  if (!/^-?[\d.,]+%?$/.test(raw)) return null;
  const digits = raw.replace("%", "");
  const normalized = digits.includes(",")
    ? digits.replace(/\./g, "").replace(",", ".")
    : /^-?\d{1,3}(\.\d{3})+$/.test(digits) ? digits.replace(/\./g, "") : digits;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

// 0,105 y 10,5 son la misma alícuota.
function vat(value: unknown): number | null {
  const parsed = amount(value);
  if (parsed === null || parsed <= 0) return null;
  return round(parsed <= 1 ? parsed * 100 : parsed, 3);
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const PERIOD = new RegExp(`\\b(${MONTHS.join("|")}|setiembre)\\b\\D{0,6}(20\\d{2})\\b`);

function periodIn(matrix: unknown[][]): SupplierList["period"] {
  for (const row of matrix) {
    for (const cell of row) {
      const match = plain(cell).match(PERIOD);
      if (!match) continue;
      const name = match[1] === "setiembre" ? "septiembre" : match[1];
      return { month: MONTHS.indexOf(name) + 1, year: Number(match[2]), label: `${name} ${match[2]}` };
    }
  }
  return null;
}

export function readSupplierPriceList(buffer: Buffer, format: SupplierPriceFormat): SupplierList {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const aliases = {
    code: format.code.map(compact),
    description: format.description.map(compact),
    costDg: format.costDg.map(compact),
    vatRate: format.vatRate.map(compact),
    publicPrice: format.publicPrice.map(compact),
  };
  const result: SupplierList = { rows: [], period: null, sheets: [], warnings: [] };
  const incomplete: string[] = [];
  const repeated = new Set<string>();
  const seen = new Map<string, SupplierListRow>();

  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    // Las hojas ocultas son listas viejas que el proveedor deja en el archivo.
    if (workbook.Workbook?.Sheets?.[sheetIndex]?.Hidden) return;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: "", raw: true });
    const headerIndex = matrix.findIndex((row) => {
      const headers = row.map(compact);
      return (["code", "costDg", "vatRate", "publicPrice"] as const).every((field) => aliases[field].some((name) => headers.includes(name)));
    });
    if (headerIndex === -1) return;
    const headers = matrix[headerIndex].map(compact);
    const column = (field: keyof typeof aliases) => headers.findIndex((header) => aliases[field].includes(header));
    const at = { code: column("code"), description: column("description"), costDg: column("costDg"), vatRate: column("vatRate"), publicPrice: column("publicPrice") };
    result.sheets.push(sheetName);
    result.period ??= periodIn(matrix.slice(0, headerIndex + 1));

    for (const row of matrix.slice(headerIndex + 1)) {
      const sourceCode = clean(row[at.code]);
      if (!sourceCode) continue;
      const costDg = amount(row[at.costDg]);
      const publicPrice = amount(row[at.publicPrice]);
      const vatRate = vat(row[at.vatRate]);
      // Títulos de sección y pie de página: no traen ningún valor.
      if (costDg === null && publicPrice === null && vatRate === null) continue;
      if (costDg === null || costDg <= 0 || publicPrice === null || publicPrice <= 0 || vatRate === null) {
        incomplete.push(sourceCode);
        continue;
      }
      // La descripción suele ocupar dos columnas (nombre y detalle) bajo el mismo título.
      const description = at.description < 0
        ? ""
        : [row[at.description], headers[at.description + 1] ? "" : row[at.description + 1]].map(clean).filter(Boolean).join(" · ");
      const item = { sourceCode, description, costDg: round(costDg, 2), vatRate, publicPrice: round(publicPrice, 2) };
      const previous = seen.get(compact(sourceCode));
      if (previous) {
        if (previous.costDg !== item.costDg || previous.publicPrice !== item.publicPrice || previous.vatRate !== item.vatRate) repeated.add(sourceCode);
        continue;
      }
      seen.set(compact(sourceCode), item);
      result.rows.push(item);
    }
  });

  if (incomplete.length) result.warnings.push(`Sin costo, IVA o precio público en el archivo (no se cargan): ${incomplete.join(", ")}.`);
  if (repeated.size) result.warnings.push(`Repetidos en el archivo con otro precio (se toma el primero): ${[...repeated].join(", ")}.`);
  return result;
}

// Modelo sin las terminaciones de voltaje que cada lista escribe distinto: "MB20A (BV) A" y "mb20a(bv" son "mb20a".
function model(code: string) {
  return compact(code).replace(/(220a?|bva?)$/, "");
}

type Matchable = { code: string; supplierCode: string };

// Cruza un código de la lista con los productos: primero el mismo código (sin importar espacios ni signos) y,
// si no hay, un único producto del mismo modelo, que queda para confirmar a mano.
export function matchSupplierCode<T extends Matchable>(sourceCode: string, products: T[]): { product: T; exact: boolean } | null {
  const key = compact(sourceCode);
  if (!key) return null;
  const exact = products.find((product) => compact(product.code) === key) ?? products.find((product) => compact(product.supplierCode) === key);
  if (exact) return { product: exact, exact: true };
  const sameModel = products.filter((product) => model(product.code) === model(sourceCode));
  return sameModel.length === 1 ? { product: sameModel[0], exact: false } : null;
}
