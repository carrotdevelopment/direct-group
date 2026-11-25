// Ajustes masivos de stock (Ingresos suma, Egresos resta): lectura de la grilla o del Excel.
export const MAX_AJUSTES = 500;

export type AjusteMode = "suma" | "resta";

export type AjusteRow = { row: number; clientCode: string; quantity: string; reason: string };

export type AjustePreviewRow = {
  row: number;
  clientCode: string;
  uniqueCode: string;
  product: string;
  quantity: number;
  reason: string;
  stock: number | null;
  result: number | null;
  errors: string[];
  warnings: string[];
};

const text = (value: unknown) => String(value ?? "").trim();
const normalize = (value: unknown) =>
  text(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

const CODE_TITLES = ["codigo cliente", "cod cliente", "codigo", "sku"];
const QUANTITY_TITLES = ["cantidad", "cant", "ajuste"];
const REASON_TITLES = ["motivo", "comentario", "comentarios", "observacion", "observaciones"];

// Unidades enteras con o sin signo; null si no se entiende ("1.000" no se adivina).
export function parseAjusteQuantity(value: unknown) {
  const clean = text(value).replace(/[−–]/g, "-").replace(/\s+/g, "");
  return /^[+-]?\d{1,9}$/.test(clean) ? Number(clean) : null;
}

export function parseAjusteSheet(matrix: unknown[][]): AjusteRow[] {
  const find = (cells: string[], titles: string[]) => {
    for (const title of titles) {
      const index = cells.indexOf(title);
      if (index >= 0) return index;
    }
    return -1;
  };
  const headerIndex = matrix.findIndex((row) => {
    const cells = Array.from(row, normalize);
    return find(cells, CODE_TITLES) >= 0 && find(cells, QUANTITY_TITLES) >= 0;
  });
  if (headerIndex < 0) throw new Error('No encontré los títulos "Código cliente" y "Cantidad" en el Excel.');
  const header = Array.from(matrix[headerIndex], normalize);
  const code = find(header, CODE_TITLES);
  const quantity = find(header, QUANTITY_TITLES);
  const reason = find(header, REASON_TITLES);
  return matrix
    .slice(headerIndex + 1)
    .map((row, offset) => ({
      row: headerIndex + offset + 2,
      clientCode: text(row[code]),
      quantity: text(row[quantity]),
      reason: reason >= 0 ? text(row[reason]) : "",
    }))
    .filter((row) => row.clientCode || row.quantity);
}
