// Columnas, orden, filtros y Excel de la pantalla de Stock, para que se exporte lo mismo que se ve.
import { CODE_TYPE_LABEL, type CodeType } from "@/lib/code-type";

export type StockRow = {
  id: string;
  vigente: boolean;
  // Regular o especial (solo Credicoop; null = sin clasificar).
  type?: CodeType | null;
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
  // Cant. Física según el último reporte de Urbano y su diferencia con el stock real
  // (null si no hay cargas de Urbano para el cliente).
  urbanoStock: number | null;
  urbanoDifference: number | null;
  totalTransactions: number;
  firstIncomeDate: string;
  // Lo que se le informó a la web del cliente (null = sin informar) y quién lo cambió por última vez.
  reportedStock: number | null;
  reportedBy?: { fixed: boolean; user: string; at: string } | null;
  validity: number;
  transactionsPerDay: number;
  stockDays: number;
  packageSize: number;
  costDgNoVat: number;
  totalCost: number;
  stockValue: number;
  unitProfit: number;
  salePrice: number;
  hasStockData: boolean;
};

export function packageRound(value: number, size: number) {
  if (!Number.isFinite(value) || value === 0) return 0;
  if (!size || size <= 1) return Math.ceil(value);
  const rounded = Math.ceil(Math.abs(value) / size) * size;
  return value < 0 ? -rounded : rounded;
}

export function stockCalc(row: StockRow, months: number) {
  const webAvailable = row.reportedStock === null ? null : row.reportedStock - row.totalTransactions;
  const adjustment = webAvailable === null ? null : row.realStock - webAvailable;
  const requiredStock = row.transactionsPerDay * months * 30;
  const surplusShortage = row.theoreticalStock - requiredStock;
  const surplusShortageByPackage = packageRound(surplusShortage, row.packageSize);
  const finalPurchase = surplusShortageByPackage < 0 ? Math.abs(surplusShortageByPackage) : 0;
  return { webAvailable, adjustment, requiredStock, surplusShortage, surplusShortageByPackage, finalPurchase };
}

export type StockLine = StockRow & ReturnType<typeof stockCalc>;

export const STOCK_COLUMNS = [
  { key: "clientCode", label: "Código" },
  { key: "uniqueCode", label: "Código único" },
  { key: "product", label: "Producto" },
  { key: "type", label: "Tipo" },
  { key: "supplier", label: "Proveedor" },
  { key: "category", label: "Categoría" },
  { key: "totalOrder", label: "Pedido tot." },
  { key: "physicalIncome", label: "Ing. físico" },
  { key: "egress", label: "Egreso" },
  { key: "theoreticalStock", label: "Stk. teórico" },
  { key: "realStock", label: "Stk. real" },
  { key: "pendingDeliveries", label: "Entg. pend." },
  { key: "urbanoStock", label: "Stk. Urbano" },
  { key: "urbanoDifference", label: "Dif. Urbano" },
  { key: "reportedStock", label: "Stk. inf." },
  { key: "webAvailable", label: "Disp. WEB" },
  { key: "adjustment", label: "Ajuste" },
  { key: "totalTransactions", label: "Trans. tot." },
  { key: "firstIncomeDate", label: "Fecha 1° ing." },
  { key: "validity", label: "Vigencia" },
  { key: "transactionsPerDay", label: "Trans./día" },
  { key: "stockDays", label: "Días stk." },
  { key: "requiredStock", label: "Stk. nec." },
  { key: "surplusShortage", label: "Sobra/Falta" },
  { key: "surplusShortageByPackage", label: "S/F bulto" },
  { key: "packageSize", label: "Bulto" },
  { key: "finalPurchase", label: "Compra final" },
  { key: "costDgNoVat", label: "Costo DG" },
  { key: "totalCost", label: "Costo tot." },
  { key: "stockValue", label: "Val. stock" },
  { key: "unitProfit", label: "Util. unit." },
  { key: "salePrice", label: "PV" },
] as const;

export type StockColumn = (typeof STOCK_COLUMNS)[number]["key"];
export type StockSort = { key: StockColumn; direction: "asc" | "desc" } | null;

const TEXT_COLUMNS: StockColumn[] = ["clientCode", "uniqueCode", "product", "type", "supplier", "category"];

// El primer clic ordena los números de mayor a menor y los textos de la A a la Z; el segundo, al revés; el
// tercero vuelve al orden por código.
export function nextSort(current: StockSort, key: StockColumn): StockSort {
  const first = TEXT_COLUMNS.includes(key) ? "asc" : "desc";
  if (current?.key !== key) return { key, direction: first };
  return current.direction === first ? { key, direction: first === "asc" ? "desc" : "asc" } : null;
}

function sortValue(line: StockLine, key: StockColumn): string | number | null {
  const value = line[key];
  if (key !== "firstIncomeDate") return value === "" || value === undefined ? null : value;
  const parts = line.firstIncomeDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return parts ? Number(parts[3]) * 10000 + Number(parts[2]) * 100 + Number(parts[1]) : null;
}

// Lo que no tiene dato queda siempre al final.
export function sortLines(lines: StockLine[], sort: StockSort) {
  if (!sort) return lines;
  const sign = sort.direction === "asc" ? 1 : -1;
  return [...lines].sort((a, b) => {
    const left = sortValue(a, sort.key);
    const right = sortValue(b, sort.key);
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    if (typeof left === "number" && typeof right === "number") return (left - right) * sign;
    return String(left).localeCompare(String(right), "es", { numeric: true, sensitivity: "base" }) * sign;
  });
}

// Proveedores de la A a la Z, sin proveedor al final; adentro se respeta el orden que traen las filas.
export function groupBySupplier(lines: StockLine[]) {
  const groups = new Map<string, { supplier: string; lines: StockLine[] }>();
  for (const line of lines) {
    const supplier = line.supplier.trim().replace(/\s+/g, " ");
    const key = supplier.toLowerCase();
    const group = groups.get(key) ?? { supplier, lines: [] };
    group.lines.push(line);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    !a.supplier !== !b.supplier ? (a.supplier ? -1 : 1) : a.supplier.localeCompare(b.supplier, "es", { sensitivity: "base" }),
  );
}

export type BalanceFilter = "" | "falta" | "sobra";
export type TypeFilter = "" | CodeType | "SIN";

export function matchesFilters(line: StockLine, balance: BalanceFilter, type: TypeFilter) {
  if (balance === "falta" && !(line.surplusShortage < 0)) return false;
  if (balance === "sobra" && !(line.surplusShortage > 0)) return false;
  return !type || (type === "SIN" ? !line.type : line.type === type);
}

// Excel con las filas que se ven, en el mismo orden. Vigente va como columna porque en pantalla es una sección.
export function stockExportSheet(lines: StockLine[], withType: boolean): (string | number)[][] {
  const columns = STOCK_COLUMNS.filter((column) => withType || column.key !== "type");
  return [
    [...columns.map((column) => column.label), "Vigente"],
    ...lines.map((line) => [
      ...columns.map(({ key }) => (key === "type" ? (line.type ? CODE_TYPE_LABEL[line.type] : "Sin clasificar") : (line[key] ?? ""))),
      line.vigente ? "Sí" : "No",
    ]),
  ];
}

export function stockExportFileName(client: string, date: Date) {
  const safe = client.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "cliente";
  const day = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  return `stock-${safe}-${day}.xlsx`;
}
