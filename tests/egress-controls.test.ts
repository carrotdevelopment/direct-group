import { describe, expect, it } from "vitest";
import { egressSourceHash, validateEgressScope } from "@/lib/egress-controls";
import { relativeDates } from "@/lib/relative-dates";

describe("controles de egresos", () => {
  it("reconoce filas idénticas aunque cambie orden de columnas, espacios o números como texto", () => {
    expect(egressSourceHash({ SKU: " A ", Cantidad: 2 })).toBe(egressSourceHash({ Cantidad: "2", SKU: "A" }));
    expect(egressSourceHash({ SKU: "A", Canje: "001" })).not.toBe(egressSourceHash({ SKU: "A", Canje: "002" }));
  });
  it("rechaza bajas sin alcance, mixtas y fechas imposibles", () => {
    expect(validateEgressScope({})).toBe(false);
    expect(validateEgressScope({ batchId: "1", from: "2026-09-01" })).toBe(false);
    expect(validateEgressScope({ from: "2026-02-30", to: "2026-03-01" })).toBe(false);
    expect(validateEgressScope({ from: "2026-09-10", to: "2026-09-01" })).toBe(false);
    expect(validateEgressScope({ batchId: "123" })).toBe(true);
    expect(validateEgressScope({ from: "2026-09-01", to: "2026-09-09" })).toBe(true);
  });
  it("calcula fechas relativas inclusivas sin UTC ni errores al cambiar de año", () => {
    const now = new Date(2026, 0, 3, 22);
    expect(relativeDates("7days", now)).toEqual({ from: "2025-12-28", to: "2026-01-03" });
    expect(relativeDates("lastMonth", now)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(relativeDates("today", now)).toEqual({ from: "2026-01-03", to: "2026-01-03" });
  });
});
