import { describe, expect, it } from "vitest";
import { costRowChanged, displayedPvcPeriod, mergeChangedPeriodRows } from "@/lib/cost-structure-rows";

describe("vigencia de PVC por fila", () => {
  const original = { costDgNoVat: 100, freightNoVat: 10, pvcNoVat: 200, pvcWithVat: 242, pvcUpdatedAt: "2026-07" };

  it("conserva la vigencia sin cambios y cambia solo la fila editada", () => {
    expect(displayedPvcPeriod(original, original, "2026-09")).toBe("2026-07");
    const edited = { ...original, pvcNoVat: 210, pvcWithVat: 254.1 };
    expect(displayedPvcPeriod(edited, original, "2026-09")).toBe("2026-09");
    expect(displayedPvcPeriod(original, original, "2026-09")).toBe("2026-07");
    expect(displayedPvcPeriod({ ...original }, original, "2026-09")).toBe("2026-07");
  });

  it("conserva la nueva fecha después de confirmar y detecta un criterio aunque no cambie el importe", () => {
    const committed = { ...original, pvcNoVat: 210, pvcWithVat: 254.1, pvcUpdatedAt: "2026-09" };
    expect(displayedPvcPeriod(committed, committed, "2026-10")).toBe("2026-09");
    const withCriterion = { ...original, freightCriterion: { mode: "pct" as const, value: 10 } };
    const edited = { ...withCriterion, freightMode: "fixed" as const, freightValue: 10 };
    expect(costRowChanged(edited, withCriterion)).toBe(true);
    expect(costRowChanged(edited, edited)).toBe(false);
  });
});

describe("mergeChangedPeriodRows", () => {
  it("reemplaza sólo los códigos modificados del cliente y período indicados", () => {
    const current = [
      { client: "Santander", period: "2026-09", uniqueCode: "A", value: 10 },
      { client: "Santander", period: "2026-09", uniqueCode: "B", value: 20 },
      { client: "Santander", period: "2026-08", uniqueCode: "A", value: 5 },
      { client: "Otro", period: "2026-09", uniqueCode: "A", value: 30 },
    ];
    const changed = [
      { client: "Santander", period: "2026-09", uniqueCode: "A", value: 99 },
    ];

    expect(mergeChangedPeriodRows(current, changed, "Santander", "2026-09"))
      .toEqual([
        current[1],
        current[2],
        current[3],
        changed[0],
      ]);
  });

  it("conserva todo cuando no hay filas modificadas", () => {
    const current = [
      { client: "Santander", period: "2026-09", uniqueCode: "A", value: 10 },
    ];

    expect(mergeChangedPeriodRows(current, [], "Santander", "2026-09"))
      .toEqual(current);
  });
});
