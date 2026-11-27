import { describe, expect, it } from "vitest";
import { buildTangoLoadReport, type TangoLoadItem } from "@/lib/tango-load-report";

const at = new Date("2026-11-26T14:30:00Z"); // 11:30 en Argentina
const period = { from: new Date("2026-11-26T03:00:00Z"), to: new Date("2026-11-27T02:59:59Z") };

describe("reporte diario de carga en Tango", () => {
  it("no arma correo si no hay nada para cargar", () => {
    expect(buildTangoLoadReport([], period)).toBeNull();
  });

  it("agrupa por tipo y muestra origen y destino de los pasajes", () => {
    const items: TangoLoadItem[] = [
      { kind: "ajusteResta", at, client: "Santander", clientCode: "DIR300", quantity: 5, detail: "Ajuste de stock: rotura", by: "Emilia" },
      { kind: "pasaje", at, client: "Macro", clientCode: "MAC-01", toClient: "Umiles", toClientCode: "URB-054", quantity: 10, uniqueCode: "DG-1", product: "Mochila", by: "Liz" },
      { kind: "ajusteSuma", at, client: "Credicoop", clientCode: "4797", quantity: 2.5 },
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
  });

  it("indica el rango cuando cubre más de un día y el singular con un solo movimiento", () => {
    const report = buildTangoLoadReport([{ kind: "devolucion", at, client: "Amex", clientCode: "OFED-1", quantity: 1 }], {
      from: new Date("2026-11-24T03:00:00Z"),
      to: period.to,
    });
    expect(report?.subject).toBe("Para cargar en Tango: 1 movimiento del 24/11/2026 al 26/11/2026");
  });
});
