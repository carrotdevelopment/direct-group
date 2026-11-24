import { describe, expect, it } from "vitest";
import { calculate, channelRates, rateBase, isAmexClient, plusPercentage, proposedPvcNoVat, selectRateConfig, type CostRate } from "@/lib/cost-structure-calculation";

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

describe("tasas por canal de Producteca", () => {
  const total = (row: { costDgNoVat: number; pvcNoVat: number; vatRate: number; channelFeePct: number }, channel: string) => {
    const rates = channelRates("Producteca", channel)!;
    return calculate({ publicPrice: 0, freightNoVat: 0, ...row }, rates.filter((r) => r.appliesTo === "COSTO"), rates.filter((r) => r.appliesTo !== "COSTO")).totalCost;
  };

  it("da el costo total de las planillas de Nación, ICBC y Tienda Credicoop", () => {
    expect(Math.abs(total({ costDgNoVat: 52541.45, pvcNoVat: 112700, vatRate: 21, channelFeePct: 20.8897 }, "Banco Nación") - 84278.66)).toBeLessThan(1);
    expect(Math.abs(total({ costDgNoVat: 23996, pvcNoVat: 52659.22, vatRate: 21, channelFeePct: 20.328 }, "ICBC") - 38149.19)).toBeLessThan(1);
    expect(Math.abs(total({ costDgNoVat: 33852.13, pvcNoVat: 85200, vatRate: 21, channelFeePct: 19.6761 }, "Tienda Credicoop") - 56192.02)).toBeLessThan(1);
  });

  it("solo Producteca tiene canales y Provincia usa las tasas del cliente", () => {
    expect(channelRates("Santander", "ICBC")).toBeNull();
    expect(channelRates("Producteca", "Provincia")).toBeNull();
  });
});

describe("tasas sobre el PVC con IVA", () => {
  it("usan el IVA de cada fila", () => {
    const row = { publicPrice: 0, costDgNoVat: 0, freightNoVat: 0, pvcNoVat: 1000 };
    expect(calculate({ ...row, vatRate: 21 }, [], [rate(0.6, "PRECIO_IVA")]).totalCost).toBe(7.26);
    expect(calculate({ ...row, vatRate: 10.5 }, [], [rate(0.6, "PRECIO_IVA")]).totalCost).toBe(6.63);
    expect(calculate({ ...row, vatRate: 21 }, [], [rate(0.6, "PRECIO")]).totalCost).toBe(6);
  });

  it("lo que no se reconoce se toma sobre el PVC sin IVA, como hasta ahora", () => {
    expect([rateBase("COSTO"), rateBase("PRECIO_IVA"), rateBase("PRECIO"), rateBase("")]).toEqual(["COSTO", "PRECIO_IVA", "PRECIO", "PRECIO"]);
  });
});

describe("porcentaje de Amex", () => {
  it("suma el porcentaje al precio: precio × (1 + % / 100)", () => {
    expect(plusPercentage(1210, 10)).toBe(1331);
    expect(plusPercentage(1000, 0)).toBe(1000);
    expect(plusPercentage(99.99, 7.5)).toBe(107.49);
    expect(plusPercentage(500, -10)).toBe(450);
    expect(plusPercentage(Number.NaN, 10)).toBe(0);
  });

  it("aplica solo al cliente Amex, no a Amex Futuro ni a otros", () => {
    expect(isAmexClient("Amex")).toBe(true);
    expect(isAmexClient("  AMEX ")).toBe(true);
    expect(isAmexClient("Amex Futuro")).toBe(false);
    expect(isAmexClient("Santander")).toBe(false);
  });
});
