import { randomUUID } from "node:crypto";
import type { Role } from "@/lib/permissions";
import type { StockTransferInput } from "@/server/schemas/stock";
import { prisma } from "@/server/lib/prisma";

export async function getCurrentStock(productId: string, clientId: string, warehouseId?: string) {
  const result = await prisma.stockMovement.aggregate({
    where: { productId, stockClientId: clientId, warehouseId: warehouseId ?? null },
    _sum: { quantity: true },
  });
  const movements = await prisma.stockMovement.findMany({
    where: { productId, stockClientId: clientId, warehouseId: warehouseId ?? null },
    select: { direction: true, quantity: true },
  });
  if (!result._sum.quantity) return 0;
  return movements.reduce((total, movement) => total + (movement.direction === "IN" ? movement.quantity.toNumber() : -movement.quantity.toNumber()), 0);
}

export async function transferStock(input: StockTransferInput, actor: { id: string; role: Role }) {
  const available = await getCurrentStock(input.productId, input.originClientId, input.warehouseId);
  if (available < input.quantity && !(input.allowNegativeStock && actor.role === "ADMIN")) {
    throw new Error(`Stock insuficiente. Disponible: ${available}`);
  }
  if (input.allowNegativeStock && actor.role !== "ADMIN") throw new Error("Solo un administrador puede autorizar stock negativo");

  const transferId = randomUUID();
  return prisma.$transaction(async (tx) => {
    const common = { productId: input.productId, originClientId: input.originClientId, destinationClientId: input.destinationClientId, warehouseId: input.warehouseId, quantity: input.quantity, transferId, comments: input.comments, createdBy: actor.id, referenceType: "STOCK_TRANSFER", referenceId: transferId };
    const outgoing = await tx.stockMovement.create({ data: { ...common, stockClientId: input.originClientId, type: "TRANSFER_OUT", direction: "OUT", idempotencyKey: `transfer:${transferId}:out` } });
    const incoming = await tx.stockMovement.create({ data: { ...common, stockClientId: input.destinationClientId, type: "TRANSFER_IN", direction: "IN", idempotencyKey: `transfer:${transferId}:in` } });
    await tx.auditLog.create({ data: { userId: actor.id, action: "TRANSFER_STOCK", entity: "StockTransfer", recordId: transferId, newData: { input, outgoingId: outgoing.id, incomingId: incoming.id } } });
    return { transferId, outgoing, incoming };
  });
}
