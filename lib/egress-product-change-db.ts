import "server-only";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { availableStockForCodes } from "@/lib/pasaje-stock-db";
import { productChangeComment, productChangeImpact } from "@/lib/egress-product-change";

export class EgressChangeError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const text = (value: unknown) => String(value ?? "").trim();

type ChangeInput = { id: number; client: string; clientCode: string; quantity: number; reason?: string };

async function prepare(input: ChangeInput) {
  if (!Number.isSafeInteger(input.id) || input.id <= 0) throw new EgressChangeError("Falta el canje a modificar.");
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new EgressChangeError("La cantidad tiene que ser mayor a cero.");
  const egress = await excelPostgres.egress.findFirst({
    where: { id: BigInt(input.id), client: { equals: text(input.client), mode: "insensitive" }, deletedAt: null },
  });
  if (!egress) throw new EgressChangeError("El canje no existe o está inactivo.", 404);
  if (text(egress.operation).toUpperCase() !== "CANJE") throw new EgressChangeError("Solo se puede cambiar el producto de un canje.");
  const fromCode = text(egress.clientCode);
  if (!fromCode) throw new EgressChangeError("El canje no tiene código cliente.");

  const target = await excelPostgres.excelClientCode.findFirst({
    where: { client: { equals: egress.client, mode: "insensitive" }, clientCode: { equals: text(input.clientCode), mode: "insensitive" }, active: true, voidedAt: null },
    orderBy: [{ assignmentYear: "desc" }, { assignmentMonth: "desc" }, { id: "desc" }],
  });
  if (!target?.clientCode) throw new EgressChangeError(`El código ${text(input.clientCode)} no está vigente para ${egress.client}.`);
  const fromQuantity = Number(egress.quantity ?? 0);
  if (target.clientCode.toLowerCase() === fromCode.toLowerCase() && quantity === fromQuantity) {
    throw new EgressChangeError("Elegí otro producto u otra cantidad: el canje quedaría igual.");
  }

  const fromUnique = text(egress.uniqueCode).toLowerCase();
  const toUnique = text(target.uniqueCode).toLowerCase();
  const [products, stock] = await Promise.all([
    excelPostgres.excelProduct.findMany({ where: { uniqueCode: { in: [fromUnique, toUnique].filter(Boolean) } }, select: { uniqueCode: true, product: true } }),
    availableStockForCodes(egress.client, [fromCode, target.clientCode]),
  ]);
  const name = (unique: string) => text(products.find((product) => text(product.uniqueCode).toLowerCase() === unique)?.product);
  const from = { clientCode: fromCode, product: name(fromUnique) || text(egress.product), quantity: fromQuantity, stockBefore: stock.get(fromCode.toLowerCase())?.real ?? 0 };
  const to = { clientCode: target.clientCode, product: name(toUnique), quantity, stockBefore: stock.get(target.clientCode.toLowerCase())?.real ?? 0 };
  return { egress, target, from, to, impact: productChangeImpact(from, to) };
}

// Muestra qué pasaría con el stock de los dos códigos, sin guardar nada.
export async function previewEgressProductChange(input: ChangeInput) {
  const { impact } = await prepare(input);
  return impact;
}

// Mueve el canje al producto nuevo y deja el cambio en el historial y en los comentarios del canje.
export async function applyEgressProductChange(input: ChangeInput, actor: string) {
  const { egress, target, from, to, impact } = await prepare(input);
  const reason = text(input.reason).slice(0, 500);
  const now = new Date();
  const comment = [text(egress.comments), productChangeComment(from, to, actor, now, reason)].filter(Boolean).join(" ");
  await excelPostgres.$transaction([
    excelPostgres.egress.update({
      where: { id: egress.id },
      data: {
        clientCode: target.clientCode,
        uniqueCode: text(target.uniqueCode) || null,
        product: to.product || egress.product,
        quantity: to.quantity,
        comments: comment,
        modifiedBy: actor,
      },
    }),
    excelPostgres.egressProductChange.create({
      data: {
        egressId: egress.id, client: egress.client,
        fromClientCode: from.clientCode, fromProduct: from.product || null, fromQuantity: from.quantity,
        toClientCode: to.clientCode, toProduct: to.product || null, toQuantity: to.quantity,
        reason: reason || null, createdBy: actor,
      },
    }),
  ]);
  return impact;
}

export async function listEgressProductChanges(egressId: number) {
  if (!Number.isSafeInteger(egressId) || egressId <= 0) return [];
  const rows = await excelPostgres.egressProductChange.findMany({ where: { egressId: BigInt(egressId) }, orderBy: { createdAt: "desc" } });
  return rows.map((row) => ({
    fromClientCode: row.fromClientCode, fromProduct: row.fromProduct, fromQuantity: Number(row.fromQuantity),
    toClientCode: row.toClientCode, toProduct: row.toProduct, toQuantity: Number(row.toQuantity),
    reason: row.reason, createdBy: row.createdBy, createdAt: row.createdAt.toISOString(),
  }));
}
