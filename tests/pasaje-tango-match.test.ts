import { describe, expect, it } from "vitest";
import { matchPasajeIncomes, tangoPasajeOperations } from "@/lib/pasaje-tango-match";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const income = (id: number, overrides: Partial<Parameters<typeof matchPasajeIncomes<number>>[0][number]> = {}) => ({
  id, client: "Producteca", clientCode: "PR-1", delivered: 10,
  orderDate: day("2026-11-02"), deliveryDate: day("2026-11-05"), ...overrides,
});
const tango = (externalKey: string, overrides: Partial<Parameters<typeof matchPasajeIncomes>[1][number]> = {}) => ({
  externalKey, operation: "PASAJE", clientCode: "PR-1", delivered: 10, deliveryDate: day("2026-11-06"), ...overrides,
});

describe("vínculo entre pasajes y filas de Tango", () => {
  it("reconoce la fila por código, sin distinguir mayúsculas, y cantidad", () => {
    expect(matchPasajeIncomes([income(1)], [tango("a", { clientCode: " pr-1 " })])).toEqual([{ id: 1, externalKey: "a" }]);
  });

  it("no vincula con otro código u otra cantidad", () => {
    expect(matchPasajeIncomes([income(1)], [tango("a", { clientCode: "PR-2" }), tango("b", { delivered: 9 })])).toEqual([]);
  });

  it("solo busca entre 7 días antes del pasaje y 30 después de confirmarlo", () => {
    const at = (date: string) => matchPasajeIncomes([income(1)], [tango("a", { deliveryDate: day(date) })]).length;
    expect(at("2026-10-26")).toBe(1);
    expect(at("2026-10-25")).toBe(0);
    expect(at("2026-12-05")).toBe(1);
    expect(at("2026-12-06")).toBe(0);
  });

  it("dos pasajes iguales necesitan dos filas de Tango", () => {
    const matches = matchPasajeIncomes([income(1), income(2)], [tango("a")]);
    expect(matches).toEqual([{ id: 1, externalKey: "a" }]);
    expect(matchPasajeIncomes([income(1), income(2)], [tango("b"), tango("a")])).toEqual([
      { id: 1, externalKey: "a" }, { id: 2, externalKey: "b" },
    ]);
  });

  it("los ajustes solo se vinculan en Umiles, donde suman stock", () => {
    const ajuste = tango("a", { operation: "AJUSTE VALORIZADO" });
    expect(matchPasajeIncomes([income(1)], [ajuste])).toEqual([]);
    expect(matchPasajeIncomes([income(1, { client: "Umiles" })], [ajuste])).toEqual([{ id: 1, externalKey: "a" }]);
    expect(tangoPasajeOperations("Producteca")).toEqual(["PASAJE"]);
    expect(tangoPasajeOperations("umiles")).toEqual(expect.arrayContaining(["PASAJE", "AJUSTE NO VALORIZADO", "AJUSTE VALORIZADO"]));
  });
});
