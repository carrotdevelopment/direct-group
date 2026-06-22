import { describe, expect, it } from "vitest";
import { stockTransferSchema } from "@/server/schemas/stock";

const cuid = "clh1234567890abcdefghijk";
describe("stockTransferSchema", () => {
  it("rechaza transferencias al mismo cliente", () => expect(stockTransferSchema.safeParse({ productId: cuid, originClientId: cuid, destinationClientId: cuid, quantity: 10, comments: "Transferencia operativa" }).success).toBe(false));
  it("rechaza cantidades negativas", () => expect(stockTransferSchema.safeParse({ productId: cuid, originClientId: cuid, destinationClientId: "clh1234567890abcdefghijl", quantity: -10, comments: "Transferencia operativa" }).success).toBe(false));
});
