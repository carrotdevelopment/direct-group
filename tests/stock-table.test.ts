import { describe, expect, it } from "vitest";
import { groupBySupplier, matchesFilters, nextSort, sortLines, stockCalc, stockExportFileName, stockExportSheet, sumColumn, type BalanceFilter, type StockRow, type TypeFilter } from "@/lib/stock-table";

const base: StockRow = {
  id: "", vigente: true, clientCode: "", uniqueCode: "", product: "", supplier: "", category: "", totalOrder: 0, physicalIncome: 0,
  egress: 0, theoreticalStock: 0, realStock: 0, pendingDeliveries: 0, urbanoStock: null, urbanoDifference: null, totalTransactions: 0,
  firstIncomeDate: "", reportedStock: 0, validity: 0, transactionsPerDay: 0, stockDays: 0, packageSize: 1, costDgNoVat: 0, totalCost: 0,
  stockValue: 0, unitProfit: 0, salePrice: 0, hasStockData: true,
};
const line = (over: Partial<StockRow>) => {
  const row = { ...base, ...over };
  return { ...row, ...stockCalc(row, 2) };
};
const codes = (lines: { clientCode: string }[]) => lines.map((item) => item.clientCode).join(",");

const lines = [
  line({ clientCode: "10", supplier: "Zeta", theoreticalStock: 5, transactionsPerDay: 1, firstIncomeDate: "02/01/2026", type: "ESPECIAL" }),
  line({ clientCode: "9", supplier: "", theoreticalStock: 100, urbanoStock: 3, firstIncomeDate: "15/12/2025", type: "REGULAR" }),
  line({ clientCode: "A1", supplier: "alfa ", theoreticalStock: 20, transactionsPerDay: 0.5, urbanoStock: 8, vigente: false }),
  line({ clientCode: "11", supplier: "Alfa", theoreticalStock: 0 }),
];

describe("tabla de Stock", () => {
  it("ordena de mayor a menor, al revés y vuelve al orden original", () => {
    const desc = nextSort(null, "surplusShortage");
    expect(codes(sortLines(lines, desc))).toBe("9,11,A1,10");
    const asc = nextSort(desc, "surplusShortage");
    expect(codes(sortLines(lines, asc))).toBe("10,A1,11,9");
    expect(nextSort(asc, "surplusShortage")).toBeNull();
    expect(codes(sortLines(lines, null))).toBe("10,9,A1,11");
    expect(codes(sortLines(lines, nextSort(null, "clientCode")))).toBe("9,10,11,A1");
  });

  it("deja sin dato al final y ordena la fecha por fecha", () => {
    expect(codes(sortLines(lines, { key: "urbanoStock", direction: "asc" }))).toBe("9,A1,10,11");
    expect(codes(sortLines(lines, { key: "urbanoStock", direction: "desc" }))).toBe("A1,9,10,11");
    expect(codes(sortLines(lines, { key: "firstIncomeDate", direction: "asc" }))).toBe("9,10,A1,11");
  });

  it("agrupa por proveedor sin distinguir mayúsculas y sin proveedor al final", () => {
    expect(groupBySupplier(lines).map((group) => [group.supplier, codes(group.lines)])).toEqual([["alfa", "A1,11"], ["Zeta", "10"], ["", "9"]]);
  });

  it("filtra sobra/falta y regular/especial", () => {
    const only = (balance: BalanceFilter, type: TypeFilter) => codes(lines.filter((item) => matchesFilters(item, balance, type)));
    expect([only("falta", ""), only("sobra", ""), only("", "ESPECIAL"), only("", "REGULAR"), only("", "SIN")]).toEqual(["10,A1", "9", "10", "9", "A1,11"]);
  });

  it("arma el Excel con lo que se ve", () => {
    const sheet = stockExportSheet(lines, true);
    const at = (row: number, label: string) => sheet[row][sheet[0].indexOf(label)];
    expect([at(1, "Sobra/Falta"), at(1, "Stk. Urbano"), at(1, "Tipo"), at(3, "Tipo"), at(3, "Vigente")]).toEqual([-55, "", "Especial", "Sin clasificar", "No"]);
    expect(stockExportSheet(lines, false)[0]).not.toContain("Tipo");
    expect(stockExportFileName("Credicoop", new Date(2026, 10, 4))).toBe("stock-Credicoop-2026-11-04.xlsx");
  });
});

describe("sumColumn", () => {
  it("suma solo las filas con dato", () => {
    const some = [line({ reportedStock: 5 }), line({ reportedStock: null }), line({ reportedStock: -2 })];
    expect(sumColumn(some, "reportedStock")).toBe(3);
    expect(sumColumn(some, "urbanoStock")).toBeNull();
  });
});
