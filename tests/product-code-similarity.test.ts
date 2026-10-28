import { describe, expect, it } from "vitest";
import { canonicalProductCode, describeSimilarCode, findSimilarProductCodes } from "@/lib/product-code-similarity";

const products = [
  { id: "1", code: "sl-ek1714wpn", name: "Pava eléctrica Smart Life" },
  { id: "2", code: "hb1002-ar", name: "Mixer Black & Decker" },
  { id: "3", code: "gs1", name: "Código corto" },
];

describe("códigos únicos parecidos", () => {
  it("compara en mayúsculas y sin acentos, espacios ni signos", () => {
    expect(canonicalProductCode(" Sl-EK 1714/wpn ")).toBe("SLEK1714WPN");
    expect(canonicalProductCode("Ñandú-1")).toBe("NANDU1");
  });

  it("encuentra el mismo código escrito distinto y códigos que se contienen", () => {
    expect(findSimilarProductCodes("SL EK1714 WPN", products)).toMatchObject([{ code: "sl-ek1714wpn", reason: "same" }]);
    expect(findSimilarProductCodes("SLEK1714", products)).toMatchObject([{ code: "sl-ek1714wpn", reason: "contained" }]);
    expect(findSimilarProductCodes("HB1002AR-NEGRO", products)).toMatchObject([{ code: "hb1002-ar", reason: "contains" }]);
  });

  it("no avisa por coincidencias cortas ni contra el mismo producto en edición", () => {
    expect(findSimilarProductCodes("GS146", products)).toEqual([]);
    expect(findSimilarProductCodes("sl-ek1714wpn", products, "1")).toEqual([]);
  });

  it("indica en qué código está lo que se escribe", () => {
    const [match] = findSimilarProductCodes("SLEK1714", products);
    expect(describeSimilarCode("SLEK1714", match)).toBe("SLEK1714 está dentro del código sl-ek1714wpn (Pava eléctrica Smart Life).");
  });
});
