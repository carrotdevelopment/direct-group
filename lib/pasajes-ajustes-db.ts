import "server-only";
import { excelPostgres } from "@/lib/excel-postgres-client";

export class PasajeAjusteError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCode(value: string) {
  return value.trim().toLowerCase();
}

// El código único identifica el producto: un pasaje solo tiene sentido si
// tanto el código cliente emisor como el receptor tienen ese mismo producto
// asignado en Códigos Cliente. La UI ya filtra por esto, pero se revalida
// acá por si alguien pega directo a la API.
async function assertSharedUniqueCode(
  fromClientCode: string,
  toClientCode: string,
  uniqueCode: string,
) {
  const [fromMapping, toMapping] = await Promise.all([
    excelPostgres.excelClientCode.findFirst({
      where: { clientCode: { equals: fromClientCode, mode: "insensitive" }, active: true },
    }),
    excelPostgres.excelClientCode.findFirst({
      where: { clientCode: { equals: toClientCode, mode: "insensitive" }, active: true },
    }),
  ]);
  if (!fromMapping || normalizeCode(text(fromMapping.uniqueCode)) !== normalizeCode(uniqueCode)) {
    throw new PasajeAjusteError("El código cliente emisor no tiene asignado ese código único.");
  }
  if (!toMapping || normalizeCode(text(toMapping.uniqueCode)) !== normalizeCode(uniqueCode)) {
    throw new PasajeAjusteError("El código cliente receptor no tiene asignado ese código único.");
  }
}

export type PasajeInput = {
  fromClient: string;
  fromClientCode: string;
  toClient: string;
  toClientCode: string;
  uniqueCode: string;
  product?: string;
  quantity: number;
  comments?: string;
};

export async function createPasaje(input: PasajeInput, createdBy: string) {
  if (input.quantity <= 0) throw new PasajeAjusteError("La cantidad tiene que ser mayor a cero.");
  if (!input.fromClient.trim() || !input.fromClientCode.trim()) {
    throw new PasajeAjusteError("Completá la empresa emisora y su código cliente.");
  }
  if (!input.toClient.trim() || !input.toClientCode.trim()) {
    throw new PasajeAjusteError("Completá la empresa receptora y su código cliente.");
  }
  if (
    text(input.fromClient).toLowerCase() === text(input.toClient).toLowerCase() &&
    text(input.fromClientCode).toLowerCase() === text(input.toClientCode).toLowerCase()
  ) {
    throw new PasajeAjusteError("El origen y el destino no pueden ser el mismo código cliente.");
  }
  if (!input.uniqueCode.trim()) {
    throw new PasajeAjusteError("Falta el código único del producto.");
  }
  await assertSharedUniqueCode(input.fromClientCode, input.toClientCode, input.uniqueCode);
  return excelPostgres.pasajeRequest.create({
    data: {
      fromClient: text(input.fromClient),
      fromClientCode: text(input.fromClientCode),
      toClient: text(input.toClient),
      toClientCode: text(input.toClientCode),
      uniqueCode: text(input.uniqueCode),
      product: text(input.product) || null,
      quantity: input.quantity,
      comments: text(input.comments) || null,
      createdBy,
    },
  });
}

export async function listPasajes(status?: string) {
  return excelPostgres.pasajeRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

export async function respondPasaje(
  id: string,
  action: "accept" | "reject",
  respondedBy: string,
  comment?: string,
) {
  return excelPostgres.$transaction(async (tx) => {
    const pasaje = await tx.pasajeRequest.findUnique({ where: { id } });
    if (!pasaje) throw new PasajeAjusteError("El pasaje no existe.", 404);
    if (pasaje.status !== "pending") throw new PasajeAjusteError("Ese pasaje ya fue resuelto.", 409);

    const updated = await tx.pasajeRequest.update({
      where: { id },
      data: {
        status: action === "accept" ? "accepted" : "rejected",
        respondedBy,
        respondedAt: new Date(),
        responseComment: text(comment) || null,
      },
    });

    if (action === "accept") {
      const now = new Date();
      await tx.egress.create({
        data: {
          client: pasaje.fromClient,
          clientCode: pasaje.fromClientCode,
          uniqueCode: pasaje.uniqueCode,
          product: pasaje.product,
          operation: "PASAJE",
          date: now,
          quantity: pasaje.quantity,
          destination: pasaje.toClient,
          comments: `Pasaje a ${pasaje.toClient} (${pasaje.toClientCode})${pasaje.comments ? ` — ${pasaje.comments}` : ""}`,
          createdBy: respondedBy,
        },
      });
      await tx.tangoIncome.create({
        data: {
          client: pasaje.toClient,
          clientCode: pasaje.toClientCode,
          operation: "PASAJE",
          orderDate: now,
          quantity: pasaje.quantity,
          deliveredQuantity: pasaje.quantity,
          deliveryDate: now,
          transferOrigin: pasaje.fromClient,
          comments: `Pasaje desde ${pasaje.fromClient} (${pasaje.fromClientCode})${pasaje.comments ? ` — ${pasaje.comments}` : ""}`,
          pendingTangoEntry: true,
          createdBy: respondedBy,
        },
      });
    }

    return updated;
  });
}

export type AjusteInput = {
  client: string;
  clientCode: string;
  uniqueCode: string;
  product?: string;
  quantity: number;
  reason?: string;
};

export async function createAjuste(input: AjusteInput, createdBy: string) {
  if (!Number.isFinite(input.quantity) || input.quantity === 0) {
    throw new PasajeAjusteError("La cantidad tiene que ser distinta de cero.");
  }
  if (!input.client.trim() || !input.clientCode.trim()) {
    throw new PasajeAjusteError("Completá el cliente y su código cliente.");
  }
  return excelPostgres.ajusteRequest.create({
    data: {
      client: text(input.client),
      clientCode: text(input.clientCode),
      uniqueCode: text(input.uniqueCode),
      product: text(input.product) || null,
      quantity: input.quantity,
      reason: text(input.reason) || null,
      createdBy,
    },
  });
}

export async function listAjustes(status?: string) {
  return excelPostgres.ajusteRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

export async function respondAjuste(
  id: string,
  action: "accept" | "reject",
  respondedBy: string,
  comment?: string,
) {
  return excelPostgres.$transaction(async (tx) => {
    const ajuste = await tx.ajusteRequest.findUnique({ where: { id } });
    if (!ajuste) throw new PasajeAjusteError("El ajuste no existe.", 404);
    if (ajuste.status !== "pending") throw new PasajeAjusteError("Ese ajuste ya fue resuelto.", 409);

    const updated = await tx.ajusteRequest.update({
      where: { id },
      data: {
        status: action === "accept" ? "accepted" : "rejected",
        respondedBy,
        respondedAt: new Date(),
        responseComment: text(comment) || null,
      },
    });

    if (action === "accept") {
      const now = new Date();
      const quantity = Number(ajuste.quantity);
      const comments = `Ajuste de stock${ajuste.reason ? `: ${ajuste.reason}` : ""}`;
      if (quantity > 0) {
        await tx.tangoIncome.create({
          data: {
            client: ajuste.client,
            clientCode: ajuste.clientCode,
            operation: "ROBO/AJUSTE",
            orderDate: now,
            quantity,
            deliveredQuantity: quantity,
            deliveryDate: now,
            comments,
            pendingTangoEntry: true,
            createdBy: respondedBy,
          },
        });
      } else {
        await tx.egress.create({
          data: {
            client: ajuste.client,
            clientCode: ajuste.clientCode,
            uniqueCode: ajuste.uniqueCode,
            product: ajuste.product,
            operation: "ROBO/AJUSTE",
            date: now,
            quantity: Math.abs(quantity),
            comments,
            createdBy: respondedBy,
          },
        });
      }
    }

    return updated;
  });
}
