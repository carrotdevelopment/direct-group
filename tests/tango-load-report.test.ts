import { describe, expect, it } from "vitest";
import { buildTangoLoadReport, loadedInTango, type TangoLoadItem, type TangoReturnedRow } from "@/lib/tango-load-report";

const at = new Date("2026-11-26T14:30:00Z"); // 11:30 en Argentina
const period = { from: new Date("2026-11-26T03:00:00Z"), to: new Date("2026-11-27T02:59:59Z") };

const item = (overrides: Partial<TangoLoadItem>): TangoLoadItem => ({
  id: "i:1",
  tangoCode: "4797",
  kind: "ajusteSuma",
  at,
  client: "Credicoop",
  clientCode: "4797",
  quantity: 10,
  ...overrides,
});
const tango = (overrides: Partial<TangoReturnedRow>): TangoReturnedRow => ({
  externalKey: "Direct_Group:STA20:1",
  operation: "AJUSTE VALORIZADO",
  clientCode: "CREDI4797",
  quantity: 10,
  date: new Date("2026-11-28T00:00:00Z"),
  ...overrides,
});

describe("reporte diario de carga en Tango", () => {
  it("no arma correo si no hay nada para cargar ni pendientes anteriores", () => {
    expect(buildTangoLoadReport([], period)).toBeNull();
    expect(buildTangoLoadReport([], period, [])).toBeNull();
  });

  it("agrupa por tipo y muestra origen y destino de los pasajes", () => {
    const items: TangoLoadItem[] = [
      item({ id: "e:1", kind: "ajusteResta", client: "Santander", clientCode: "DIR300", tangoCode: "DIR300", quantity: 5, detail: "Ajuste de stock: rotura", by: "Emilia" }),
      item({ id: "p:1", kind: "pasaje", client: "Macro", clientCode: "MAC-01", toClient: "Umiles", toClientCode: "URB-054", tangoCode: "URB-054", quantity: 10, uniqueCode: "DG-1", product: "Mochila", by: "Liz" }),
      item({ id: "i:2", quantity: 2.5 }),
    ];
    const report = buildTangoLoadReport(items, period);
    expect(report?.subject).toBe("Para cargar en Tango: 3 movimientos del 26/11/2026");
    const text = report?.text ?? "";
    expect(text.indexOf("Pasajes confirmados (1)")).toBeLessThan(text.indexOf("Ajustes que suman stock (1)"));
    expect(text.indexOf("Ajustes que suman stock (1)")).toBeLessThan(text.indexOf("Ajustes que restan stock (1)"));
    expect(text).toContain("• Macro MAC-01 → Umiles URB-054 · 10 u. · DG-1 Mochila · 26/11 11:30, Liz");
    expect(text).toContain("• Credicoop 4797 · 2,5 u. · 26/11 11:30");
    expect(text).toContain("• Santander DIR300 · 5 u. · Ajuste de stock: rotura · 26/11 11:30, Emilia");
    expect(text).not.toContain("Devoluciones");
    expect(text).not.toContain("Siguen sin aparecer en Tango");
  });

  it("indica el rango cuando cubre más de un día y el singular con un solo movimiento", () => {
    const report = buildTangoLoadReport([item({ kind: "devolucion", client: "Amex", clientCode: "OFED-1", quantity: 1 })], {
      from: new Date("2026-11-24T03:00:00Z"),
      to: period.to,
    });
    expect(report?.subject).toBe("Para cargar en Tango: 1 movimiento del 24/11/2026 al 26/11/2026");
  });

  it("manda lo de días anteriores que todavía no volvió desde Tango, aunque no haya nada nuevo", () => {
    const earlier = item({ id: "i:9", at: new Date("2026-11-24T14:30:00Z"), clientCode: "3020", tangoCode: "3020" });
    const report = buildTangoLoadReport([], period, [earlier]);
    expect(report?.subject).toBe("Para cargar en Tango: 1 pendiente anterior");
    expect(report?.text).toContain("No hubo movimientos nuevos del 26/11/2026 para cargar en Tango.");
    expect(report?.text).toContain("Siguen sin aparecer en Tango (1)");
    expect(report?.text).toContain("• Credicoop 3020 · 10 u. · 24/11 11:30 · ajustes que suman stock");
  });
});

describe("corroborar contra lo que vuelve de Tango", () => {
  it("reconoce el código de Credicoop con el prefijo CREDI y la misma cantidad", () => {
    expect(loadedInTango([item({})], [tango({})])).toEqual(new Set(["i:1"]));
  });

  it("no corrobora con otra cantidad, otra operación o fuera de la ventana de fechas", () => {
    expect(loadedInTango([item({})], [tango({ quantity: 9 })]).size).toBe(0);
    expect(loadedInTango([item({})], [tango({ operation: "DEVOLUCION" })]).size).toBe(0);
    expect(loadedInTango([item({})], [tango({ date: new Date("2027-01-15T00:00:00Z") })]).size).toBe(0);
    expect(loadedInTango([item({})], [tango({ date: new Date("2026-11-10T00:00:00Z") })]).size).toBe(0);
  });

  it("empareja de a uno: dos ajustes iguales necesitan dos filas de Tango", () => {
    const items = [item({ id: "i:1" }), item({ id: "i:2", at: new Date("2026-11-26T15:00:00Z") })];
    expect(loadedInTango(items, [tango({})])).toEqual(new Set(["i:1"]));
    expect(loadedInTango(items, [tango({}), tango({ externalKey: "Direct_Group:STA20:2" })])).toEqual(new Set(["i:1", "i:2"]));
  });

  it("un pasaje se busca por el código del destino y los ajustes que restan nunca se corroboran", () => {
    const pasaje = item({ id: "p:1", kind: "pasaje", clientCode: "MAC-01", tangoCode: "URB-054" });
    expect(loadedInTango([pasaje], [tango({ operation: "AJUSTE NO VALORIZADO", clientCode: "URB-054" })])).toEqual(new Set(["p:1"]));
    const resta = item({ id: "e:1", kind: "ajusteResta" });
    expect(loadedInTango([resta], [tango({})]).size).toBe(0);
  });
});
