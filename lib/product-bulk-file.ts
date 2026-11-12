// Lectura de un Excel o CSV para la carga masiva de productos. Las columnas se reconocen por el encabezado
// (en cualquier orden); si la primera fila no es un encabezado, se toman en el orden de la plantilla.

export type ProductBulkRow = {
  name: string;
  brand: string;
  code: string;
  supplier: string;
  category: string;
  unitsPerPackage: string;
  supplierCode: string;
};

export const PRODUCT_BULK_COLUMNS: (keyof ProductBulkRow)[] = [
  "name", "brand", "code", "supplier", "category", "unitsPerPackage", "supplierCode",
];

export const PRODUCT_BULK_HEADERS = ["Producto", "Marca", "Código único", "Proveedor", "Categoría", "Bulto", "Cód. Único Prov."];

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Encabezados aceptados para cada columna, ya normalizados.
const HEADER_ALIASES: Record<keyof ProductBulkRow, string[]> = {
  name: ["producto", "nombre", "nombre producto", "descripcion"],
  brand: ["marca"],
  code: ["codigo unico", "cod unico", "codigo", "sku"],
  supplier: ["proveedor"],
  category: ["categoria", "rubro"],
  unitsPerPackage: ["bulto", "unidades por bulto", "unidades bulto", "u bulto"],
  supplierCode: ["cod unico prov", "codigo unico proveedor", "codigo proveedor", "cod proveedor", "cod prov", "codigo prov"],
};

function headerColumns(header: unknown[]) {
  const found = new Map<keyof ProductBulkRow, number>();
  header.forEach((cell, index) => {
    const key = normalize(cell);
    const column = PRODUCT_BULK_COLUMNS.find((col) => HEADER_ALIASES[col].includes(key));
    if (column && !found.has(column)) found.set(column, index);
  });
  // Es encabezado si al menos reconoce el producto o el código único.
  return found.has("name") || found.has("code") ? found : null;
}

export function productBulkRowsFromSheet(rows: unknown[][]): ProductBulkRow[] {
  if (rows.length === 0) return [];
  const byHeader = headerColumns(rows[0]);
  const indexOf = byHeader ?? new Map(PRODUCT_BULK_COLUMNS.map((col, index) => [col, index]));
  return (byHeader ? rows.slice(1) : rows)
    .map((row) => {
      const result = {} as ProductBulkRow;
      for (const col of PRODUCT_BULK_COLUMNS) {
        const index = indexOf.get(col);
        result[col] = index === undefined ? "" : String(row[index] ?? "").trim();
      }
      return result;
    })
    .filter((row) => PRODUCT_BULK_COLUMNS.some((col) => row[col]));
}
