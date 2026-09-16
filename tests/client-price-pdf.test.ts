import { describe, expect, it } from "vitest";
import { createClientPricePdf } from "@/lib/client-price-pdf";

describe("createClientPricePdf", () => {
  it("genera un PDF real y paginado con la lista de precios", () => {
    const rows = Array.from({ length: 45 }, (_, index) => ({
      clientCode: `CLI-${index}`,
      uniqueCode: `PROD-${index}`,
      product: `Producto ${index}`,
      category: "Categoria",
      priceWithVat: 1000 + index,
      validity: "09/2026",
    }));

    const content = new TextDecoder().decode(
      createClientPricePdf("Santander", "09/2026", rows),
    );

    expect(content.startsWith("%PDF-1.4")).toBe(true);
    expect(content.endsWith("%%EOF")).toBe(true);
    expect(content).toContain("/Type /Pages");
    expect(content).toContain("/Count 3");
    expect(content).toContain("(LISTA DE PRECIOS)");
    expect(content).toContain("(Vigencia: 09/2026)");
  });
});
