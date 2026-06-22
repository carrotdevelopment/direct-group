import { describe, expect, it } from "vitest";
import { can } from "@/lib/permissions";

describe("RBAC", () => {
  it("permite al depósito operar stock", () => expect(can("DEPOSITO", "stock", "operate")).toBe(true));
  it("impide al vendedor modificar pricing", () => expect(can("VENDEDOR", "pricing", "update")).toBe(false));
  it("limita lectura a operaciones de consulta", () => expect(can("LECTURA", "productos", "delete")).toBe(false));
});
