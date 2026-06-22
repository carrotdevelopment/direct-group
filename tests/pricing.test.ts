import { describe, expect, it } from "vitest";
import { calculatePricing } from "@/server/services/pricing.service";

describe("calculatePricing", () => {
  it("calcula costo total, precio y utilidad sin perder precisión monetaria", () => {
    expect(calculatePricing({ cost: 1_000, vatRate: 21, markupRate: 30, insurance: 25, freight: 75 })).toEqual({ totalCost: 1_100, netSalePrice: 1_430, grossSalePrice: 1_730.3, profit: 330, profitPercentage: 30 });
  });
  it("no produce divisiones inválidas con costo cero", () => {
    expect(calculatePricing({ cost: 0, vatRate: 21, markupRate: 30 }).profitPercentage).toBe(0);
  });
});
