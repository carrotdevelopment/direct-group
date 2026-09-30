import { describe, expect, it } from "vitest";
import { validateProductCodes } from "@/lib/product-uniqueness";

describe("product code uniqueness", () => {
  it("rejects repeated codes in a batch regardless of case and whitespace", () => {
    expect(() => validateProductCodes([
      { id: "1", code: " ab  123 " }, { id: "2", code: "AB 123" },
    ])).toThrow("ya existe");
  });

  it("rejects a new record using an existing code", () => {
    expect(() => validateProductCodes(
      [{ id: "new", code: "abc" }], [{ id: "1", code: " ABC " }],
    )).toThrow("ya existe");
  });

  it("allows editing the same product and preserves leading zeros", () => {
    expect(() => validateProductCodes(
      [{ id: "1", code: "001" }, { id: "2", code: "1" }],
      [{ id: "1", code: "001" }],
    )).not.toThrow();
  });
});
