import { describe, expect, it } from "vitest";
import { productChangeComment, productChangeImpact } from "@/lib/egress-product-change";

const negra = { clientCode: "URB-101", product: "Aspiradora negra", quantity: 5, stockBefore: 10 };
const roja = { clientCode: "URB-102", product: "Aspiradora roja", quantity: 5, stockBefore: 7 };

describe("cambio de producto de un canje", () => {
  it("el código original recupera las unidades y el nuevo las descuenta", () => {
    const impact = productChangeImpact(negra, roja);
    expect(impact.from.stockAfter).toBe(15);
    expect(impact.to.stockAfter).toBe(2);
    expect(impact.messages[0]).toContain("URB-101 (Aspiradora negra) recupera 5 unidades");
    expect(impact.messages[1]).toContain("URB-102 (Aspiradora roja) descuenta 5 unidades");
    expect(impact.warnings).toEqual([]);
  });

  it("avisa si el producto nuevo no tiene stock suficiente", () => {
    const impact = productChangeImpact(negra, { ...roja, quantity: 9 });
    expect(impact.to.stockAfter).toBe(-2);
    expect(impact.warnings[0]).toContain("URB-102 no tiene stock suficiente");
  });

  it("con el mismo código solo cambia la cantidad descontada", () => {
    const impact = productChangeImpact(negra, { ...negra, quantity: 3 });
    expect(impact.sameCode).toBe(true);
    expect(impact.from.stockAfter).toBe(12);
    expect(impact.messages[0]).toContain("pasa de 5 a 3 unidades");
  });

  it("deja el cambio escrito en los comentarios del canje", () => {
    expect(productChangeComment(negra, roja, "Liz", new Date("2026-10-28T15:00:00Z"), "no hay negras")).toBe(
      "[Cambio de producto 28/10/2026, Liz: URB-101 x5 → URB-102 x5 · no hay negras]",
    );
  });
});
