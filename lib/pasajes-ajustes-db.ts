import "server-only";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { invalidateIncomeGroups } from "@/lib/postgres-operation-db";
import { canActForClient, type PasajeActor } from "@/lib/module-access";

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

function isSelf(actor: PasajeActor, createdBy: string) {
  return actor.role !== "ADMIN" && actor.name.trim().toLowerCase() === createdBy.trim().toLowerCase();
}

// Un operador solo puede generar movimientos desde los clientes que se le
// asignaron en Permisos; el administrador no tiene restricción.
function assertCanCreateFor(actor: PasajeActor, client: string) {
  if (!canActForClient(actor, client)) {
    throw new PasajeAjusteError(`No tenés asignado el cliente ${client} para generar este movimiento.`, 403);
  }
}

export function visibleToActor(actor: PasajeActor, clients: string[]) {
  return actor.role === "ADMIN" || clients.some((client) => canActForClient(actor, client));
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

export class PasajeBatchError extends PasajeAjusteError {
  constructor(public rowErrors: { index: number; message: string }[]) {
    super("Hay filas con errores. Corregilas y volvé a enviar: no se cargó ninguna.", 422);
  }
}

// Valida un pasaje y devuelve los datos listos para guardar.
async function preparePasaje(input: PasajeInput, actor: PasajeActor) {
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new PasajeAjusteError("La cantidad tiene que ser mayor a cero.");
  if (!text(input.fromClient) || !text(input.fromClientCode)) {
    throw new PasajeAjusteError("Completá la empresa emisora y su código cliente.");
  }
  if (!text(input.toClient) || !text(input.toClientCode)) {
    throw new PasajeAjusteError("Completá la empresa receptora y su código cliente.");
  }
  if (
    text(input.fromClient).toLowerCase() === text(input.toClient).toLowerCase() &&
    text(input.fromClientCode).toLowerCase() === text(input.toClientCode).toLowerCase()
  ) {
    throw new PasajeAjusteError("El origen y el destino no pueden ser el mismo código cliente.");
  }
  if (!text(input.uniqueCode)) {
    throw new PasajeAjusteError("Falta el código único del producto.");
  }
  assertCanCreateFor(actor, input.fromClient);
  await assertSharedUniqueCode(input.fromClientCode, input.toClientCode, input.uniqueCode);
  return {
    fromClient: text(input.fromClient),
    fromClientCode: text(input.fromClientCode),
    toClient: text(input.toClient),
    toClientCode: text(input.toClientCode),
    uniqueCode: text(input.uniqueCode),
    product: text(input.product) || null,
    quantity,
    comments: text(input.comments) || null,
    createdBy: actor.name,
  };
}

export async function createPasaje(input: PasajeInput, actor: PasajeActor) {
  return excelPostgres.pasajeRequest.create({ data: await preparePasaje(input, actor) });
}

// Carga en lote: se validan todas las filas y, si alguna falla, no se carga ninguna.
export async function createPasajesBatch(inputs: PasajeInput[], actor: PasajeActor) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new PasajeAjusteError("No hay filas para cargar.");
  if (inputs.length > 200) throw new PasajeAjusteError("Se pueden cargar hasta 200 pasajes por vez.");
  const prepared: Awaited<ReturnType<typeof preparePasaje>>[] = [];
  const rowErrors: { index: number; message: string }[] = [];
  for (let index = 0; index < inputs.length; index += 1) {
    try {
      prepared.push(await preparePasaje(inputs[index], actor));
    } catch (error) {
      rowErrors.push({ index, message: error instanceof Error ? error.message : "Fila inválida." });
    }
  }
  if (rowErrors.length) throw new PasajeBatchError(rowErrors);
  const result = await excelPostgres.pasajeRequest.createMany({ data: prepared });
  return { created: result.count };
}

export async function listPasajes(actor: PasajeActor, status?: string) {
  const rows = await excelPostgres.pasajeRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return rows.filter((row) => visibleToActor(actor, [row.fromClient, row.toClient]));
}

// Estados: pending (espera aprobación del receptor) → approved (el receptor aprobó:
// se carga el ingreso y el egreso queda en espera) → confirmed (el emisor confirma la
// cantidad enviada: se ejecuta el egreso). rejected cierra el pasaje sin mover stock.
export async function respondPasaje(
  id: string,
  action: "approve" | "reject",
  actor: PasajeActor,
  comment?: string,
) {
  const respondedBy = actor.name;
  const result = await excelPostgres.$transaction(async (tx) => {
    const pasaje = await tx.pasajeRequest.findUnique({ where: { id } });
    if (!pasaje) throw new PasajeAjusteError("El pasaje no existe.", 404);
    if (pasaje.status !== "pending") throw new PasajeAjusteError("Ese pasaje ya fue resuelto.", 409);
    if (!canActForClient(actor, pasaje.toClient)) {
      throw new PasajeAjusteError(`Solo quien tiene asignado el cliente ${pasaje.toClient} puede aprobar o rechazar este pasaje.`, 403);
    }
    if (isSelf(actor, pasaje.createdBy)) {
      throw new PasajeAjusteError("No podés resolver un pasaje que generaste vos: lo tiene que aprobar la otra parte.", 403);
    }

    const updated = await tx.pasajeRequest.update({
      where: { id },
      data: {
        status: action === "approve" ? "approved" : "rejected",
        respondedBy,
        respondedAt: new Date(),
        responseComment: text(comment) || null,
      },
    });

    if (action === "approve") {
      const now = new Date();
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
  if (action === "approve") invalidateIncomeGroups();
  return result;
}

// El emisor confirma cuánto se envió realmente. Se ejecuta el egreso por esa cantidad y,
// si es menor a la aprobada, la diferencia se carga como egreso "Ajuste de Stock".
export async function confirmPasaje(id: string, confirmedQuantity: number, actor: PasajeActor) {
  const quantityConfirmed = Number(confirmedQuantity);
  if (!Number.isFinite(quantityConfirmed) || quantityConfirmed < 0) {
    throw new PasajeAjusteError("La cantidad confirmada no es válida.");
  }
  return excelPostgres.$transaction(async (tx) => {
    const pasaje = await tx.pasajeRequest.findUnique({ where: { id } });
    if (!pasaje) throw new PasajeAjusteError("El pasaje no existe.", 404);
    if (pasaje.status !== "approved") {
      throw new PasajeAjusteError("Solo se pueden confirmar pasajes aprobados que todavía no se confirmaron.", 409);
    }
    if (!canActForClient(actor, pasaje.fromClient)) {
      throw new PasajeAjusteError(`Solo quien tiene asignado el cliente ${pasaje.fromClient} puede confirmar este pasaje.`, 403);
    }
    const approved = Number(pasaje.quantity);
    if (quantityConfirmed > approved) {
      throw new PasajeAjusteError(`No se puede confirmar más de lo aprobado (${approved}).`);
    }

    const now = new Date();
    const updated = await tx.pasajeRequest.update({
      where: { id },
      data: { status: "confirmed", confirmedQuantity: quantityConfirmed, confirmedBy: actor.name, confirmedAt: now },
    });
    const base = {
      client: pasaje.fromClient,
      clientCode: pasaje.fromClientCode,
      uniqueCode: pasaje.uniqueCode,
      product: pasaje.product,
      date: now,
      createdBy: actor.name,
    };
    if (quantityConfirmed > 0) {
      await tx.egress.create({
        data: {
          ...base,
          operation: "PASAJE",
          quantity: quantityConfirmed,
          destination: pasaje.toClient,
          comments: `Pasaje a ${pasaje.toClient} (${pasaje.toClientCode})${pasaje.comments ? ` — ${pasaje.comments}` : ""}`,
        },
      });
    }
    const difference = approved - quantityConfirmed;
    if (difference > 0) {
      await tx.egress.create({
        data: {
          ...base,
          operation: "ROBO/AJUSTE",
          quantity: difference,
          destination: pasaje.toClient,
          comments: `Ajuste de Stock: pasaje a ${pasaje.toClient} (${pasaje.toClientCode}) confirmado por menos cantidad (aprobado ${approved}, confirmado ${quantityConfirmed})`,
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

export async function createAjuste(input: AjusteInput, actor: PasajeActor) {
  const createdBy = actor.name;
  if (!Number.isFinite(input.quantity) || input.quantity === 0) {
    throw new PasajeAjusteError("La cantidad tiene que ser distinta de cero.");
  }
  if (!input.client.trim() || !input.clientCode.trim()) {
    throw new PasajeAjusteError("Completá el cliente y su código cliente.");
  }
  assertCanCreateFor(actor, input.client);
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

export async function listAjustes(actor: PasajeActor, status?: string) {
  const rows = await excelPostgres.ajusteRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return rows.filter((row) => visibleToActor(actor, [row.client]));
}

export async function respondAjuste(
  id: string,
  action: "accept" | "reject",
  actor: PasajeActor,
  comment?: string,
) {
  const respondedBy = actor.name;
  const result = await excelPostgres.$transaction(async (tx) => {
    const ajuste = await tx.ajusteRequest.findUnique({ where: { id } });
    if (!ajuste) throw new PasajeAjusteError("El ajuste no existe.", 404);
    if (ajuste.status !== "pending") throw new PasajeAjusteError("Ese ajuste ya fue resuelto.", 409);
    if (!canActForClient(actor, ajuste.client)) {
      throw new PasajeAjusteError(`Solo quien tiene asignado el cliente ${ajuste.client} puede aceptar o rechazar este ajuste.`, 403);
    }
    if (isSelf(actor, ajuste.createdBy)) {
      throw new PasajeAjusteError("No podés resolver un ajuste que generaste vos: lo tiene que aprobar otra persona.", 403);
    }

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
  if (action === "accept") invalidateIncomeGroups();
  return result;
}
