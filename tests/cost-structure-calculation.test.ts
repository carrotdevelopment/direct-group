import { describe, expect, it } from "vitest";
import { calculate, proposedPvcNoVat, selectRateConfig, type CostRate } from "@/lib/cost-structure-calculation";

const rate = (valuePct: number, appliesTo: CostRate["appliesTo"]): CostRate => ({
  id: "1", rateName: "Cargo", rateKey: "cargo", applies: true, valuePct, appliesTo, sortOrder: 1,
});

describe("cálculo compartido de estructura", () => {
  it("calcula cargos por base y rentabilidad sobre costo, con importes conocidos", () => {
    const result = calculate({ publicPrice: 242, vatRate: 21, costDgNoVat: 100, freightNoVat: 10, pvcNoVat: 200 }, [rate(2, "COSTO")], [rate(5, "PRECIO")]);
    expect(result).toMatchObject({ ppNoVat: 200, totalCost: 122, profit: 78, profitPct: 63.93 });
  });

  it("respeta IVA cero y redondea cada cargo antes de sumar", () => {
    const result = calculate({ publicPrice: 100, vatRate: 0, costDgNoVat: 1, freightNoVat: 0, pvcNoVat: 2 }, [rate(0.5, "COSTO"), rate(0.5, "COSTO")], []);
    expect(result).toMatchObject({ ppNoVat: 100, totalCost: 1.02, profit: 0.98, profitPct: 96.08 });
  });

  it("selecciona la configuración histórica completa y no una futura", () => {
    const configs = [{ effectiveFrom: "2026-09" }, { effectiveFrom: "2026-06" }];
    expect(selectRateConfig(configs, "2026-08")).toEqual(configs[1]);
    expect(selectRateConfig(configs, "2026-05")).toBeNull();
  });

  it("propone un PVC para la rentabilidad objetivo y rechaza objetivos imposibles", () => {
    expect(proposedPvcNoVat(100, 0, 20, [], [])).toBe(120);
    expect(proposedPvcNoVat(100, 0, 100, [], [rate(50, "PRECIO")])).toBeNull();
    expect(calculate({ publicPrice: 0, vatRate: 0, costDgNoVat: 0, freightNoVat: 0, pvcNoVat: 0 }, [], []).profitPct).toBe(0);
  });
});
