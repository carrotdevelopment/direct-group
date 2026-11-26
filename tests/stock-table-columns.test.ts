import { describe, expect, it } from "vitest";
import { amexCodeGroup, defaultStockColumns, matchesColumnFilter, stockCalc, type StockRow } from "@/lib/stock-table";

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

describe("filtro por columna de Stock", () => {
  it("en texto busca lo que contiene, sin mayúsculas", () => {
    expect(matchesColumnFilter(line({ product: "Mochila Roja" }), "product", "roja")).toBe(true);
    expect(matchesColumnFilter(line({ product: "Mochila Roja" }), "product", "azul")).toBe(false);
  });
  it("en números acepta comparaciones y un valor exacto", () => {
    const row = line({ realStock: -5 });
    expect(matchesColumnFilter(row, "realStock", "<0")).toBe(true);
    expect(matchesColumnFilter(row, "realStock", ">=0")).toBe(false);
    expect(matchesColumnFilter(row, "realStock", "-5")).toBe(true);
    expect(matchesColumnFilter(row, "realStock", "")).toBe(true);
  });
  it("sin dato no pasa un filtro numérico", () => {
    expect(matchesColumnFilter(line({ urbanoStock: null }), "urbanoStock", ">0")).toBe(false);
  });
  it("filtra el tipo por su nombre", () => {
    expect(matchesColumnFilter(line({ type: "ESPECIAL" }), "type", "espe")).toBe(true);
    expect(matchesColumnFilter(line({ type: null }), "type", "sin")).toBe(true);
  });
});

describe("columnas por defecto", () => {
  it("Santander arranca sin Urbano ni stock informado", () => {
    const cols = defaultStockColumns("Santander", false);
    expect(cols).not.toContain("urbanoStock");
    expect(cols).not.toContain("reportedStock");
    expect(cols).toContain("realStock");
    expect(cols).not.toContain("supplier");
  });
  it("el tipo solo aparece donde se usa", () => {
    expect(defaultStockColumns("Credicoop", true)).toContain("type");
    expect(defaultStockColumns("Pampa", false)).not.toContain("type");
    expect(defaultStockColumns("Pampa", false)).toContain("urbanoStock");
  });
});

describe("Amex", () => {
  it("separa OFED de DG", () => {
    expect(amexCodeGroup("OFED-6296")).toBe("OFED");
    expect(amexCodeGroup("DG99-0412")).toBe("DG");
  });
});
