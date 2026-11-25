import { describe, expect, it } from "vitest";
import { parseInformado, resolveInformado } from "@/lib/stock-informado";
import { stockCalc, type StockRow } from "@/lib/stock-table";

describe("stock informado", () => {
  it("sin informar queda vacío, salvo los clientes que informan el ingreso físico", () => {
    expect(resolveInformado("Pampa", undefined, 50)).toBeNull();
    expect(resolveInformado(" UMILES", undefined, 50)).toBe(50);
    expect(resolveInformado("Pampa", { quantity: 0, overIncome: false }, 50)).toBe(0);
    expect(resolveInformado("Santander", { quantity: -16, overIncome: true }, 50)).toBe(34);
    expect(resolveInformado("Santander", { quantity: 20, overIncome: false }, 50)).toBe(20);
    expect(resolveInformado("Santander", { quantity: null, overIncome: false }, 50)).toBe(50);
  });
  it("lee enteros y vacíos, y no adivina", () => {
    expect(["31", "", null, "abc", "1.000", undefined].map(parseInformado)).toEqual([31, null, null, undefined, undefined, undefined]);
  });
  it("sin informado no calcula disponible ni ajuste", () => {
    const row = { reportedStock: null, totalTransactions: 24, realStock: -4, transactionsPerDay: 0, theoreticalStock: 16, packageSize: 1 } as StockRow;
    expect(stockCalc(row, 2)).toMatchObject({ webAvailable: null, adjustment: null });
    expect(stockCalc({ ...row, reportedStock: 31 }, 2)).toMatchObject({ webAvailable: 7, adjustment: -11 });
  });
});
