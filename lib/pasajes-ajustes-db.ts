import "server-only";
import type { PasajeRequest, Prisma } from "../node_modules/.prisma/excel-client";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { invalidateIncomeGroups } from "@/lib/postgres-operation-db";
import { tangoPasajeOperations, tangoWindowStart } from "@/lib/pasaje-tango-match";
import { matchUrbanoReceptions, urbanoSearchStart } from "@/lib/pasaje-urbano-match";
import { canActForClient, canConfirmPasaje, canSeePasaje, type PasajeActor } from "@/lib/module-access";

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

// Un operador solo puede generar ajustes de los clientes que se le asignaron en Permisos; el
// administrador no tiene restricción. Los pasajes se pueden generar desde cualquier cliente.
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

type PasajeMovement = {
  fromClient: string;
  fromClientCode: string;
  toClient: string;
  toClientCode: string;
  uniqueCode: string;
  product: string | null;
  comments: string | null;
};

function egressForPasaje(pasajeId: string, pasaje: PasajeMovement, quantity: number, date: Date, createdBy: string) {
  return {
    pasajeId,
    client: pasaje.fromClient,
    clientCode: pasaje.fromClientCode,
    uniqueCode: pasaje.uniqueCode,
    product: pasaje.product,
    operation: "PASAJE",
    date,
    quantity,
    destination: pasaje.toClient,
    comments: `Pasaje a ${pasaje.toClient} (${pasaje.toClientCode})${pasaje.comments ? ` — ${pasaje.comments}` : ""}`,
    createdBy,
  };
}

function incomeForPasaje(pasajeId: string, pasaje: PasajeMovement, quantity: number, date: Date, createdBy: string) {
  return {
    pasajeId,
    client: pasaje.toClient,
    clientCode: pasaje.toClientCode,
    operation: "PASAJE",
    orderDate: date,
    quantity,
    transferOrigin: pasaje.fromClient,
    comments: `Pasaje desde ${pasaje.fromClient} (${pasaje.fromClientCode})${pasaje.comments ? ` — ${pasaje.comments}` : ""}`,
    pendingTangoEntry: true,
    createdBy,
  };
}

export type NewPasaje = PasajeMovement & Omit<Prisma.PasajeRequestUncheckedCreateInput, keyof PasajeMovement | "egressImpacted"> & { quantity: number; createdBy: string };

// Crea el pasaje con sus dos movimientos: el egreso del origen impacta en el momento y el ingreso al
// destino queda pendiente (entregado en 0, no suma stock) hasta que se confirme lo que pasó Urbano.
export async function createPasajeWithMovements(tx: Prisma.TransactionClient, data: NewPasaje, date = new Date()) {
  const pasaje = await tx.pasajeRequest.create({ data: { ...data, egressImpacted: true } });
  await tx.egress.create({ data: egressForPasaje(pasaje.id, data, data.quantity, date, data.createdBy) });
  await tx.tangoIncome.create({ data: { ...incomeForPasaje(pasaje.id, data, data.quantity, date, data.createdBy), deliveredQuantity: 0 } });
  return pasaje;
}

// Deshace los movimientos de un pasaje que no se realizó. El egreso se inactiva, como desde el
// historial, y el ingreso pendiente se borra porque nunca sumó stock.
async function revertPasajeMovements(tx: Prisma.TransactionClient, pasajeId: string, actor: string, date: Date) {
  await tx.egress.updateMany({
    where: { pasajeId, deletedAt: null },
    data: { deletedAt: date, deletedBy: actor, modifiedBy: actor },
  });
  await tx.tangoIncome.deleteMany({ where: { pasajeId, externalKey: null } });
}

// Si el pasaje ya se cargó en Tango y la importación lo trajo antes de confirmar, esa fila es el ingreso:
// queda vinculada al pasaje y se borra el pendiente, para no contarlo dos veces.
async function linkExistingTangoIncome(
  tx: Prisma.TransactionClient,
  pasaje: { id: string; fromClient: string; toClient: string; toClientCode: string; createdAt: Date },
  quantity: number,
) {
  const row = await tx.tangoIncome.findFirst({
    where: {
      pasajeId: null,
      externalKey: { not: null },
      clientCode: { equals: pasaje.toClientCode, mode: "insensitive" },
      deliveredQuantity: quantity,
      operation: { in: tangoPasajeOperations(pasaje.toClient) },
      deliveryDate: { gte: tangoWindowStart(pasaje.createdAt) },
    },
    orderBy: [{ deliveryDate: "asc" }, { id: "asc" }],
  });
  if (!row) return false;
  await tx.tangoIncome.update({ where: { id: row.id }, data: { pasajeId: pasaje.id, transferOrigin: pasaje.fromClient } });
  await tx.tangoIncome.deleteMany({ where: { pasajeId: pasaje.id, externalKey: null } });
  return true;
}

export async function createPasaje(input: PasajeInput, actor: PasajeActor) {
  const data = await preparePasaje(input, actor);
  const pasaje = await excelPostgres.$transaction((tx) => createPasajeWithMovements(tx, data));
  invalidateIncomeGroups();
  return pasaje;
}

// Estados: pending (ya egresó del origen; el ingreso espera lo que informe Urbano) → confirmed (ingresó al
// destino lo que recibió Urbano, automáticamente o a mano si la cantidad no coincide). rejected es un pasaje
// cancelado: se revierte el egreso. approved es de cuando había aprobaciones: se trata igual que pending.
const OPEN_STATUSES = ["pending", "approved"];
export const URBANO_ACTOR = "Urbano (automático)";

// Recepciones de Urbano sin usar, cruzadas con los pasajes abiertos.
async function urbanoMatches(open: PasajeRequest[]) {
  if (open.length === 0) return { matches: [], review: [] };
  const from = new Date(Math.min(...open.map((pasaje) => urbanoSearchStart(pasaje).getTime())));
  const receptions = await excelPostgres.urbanoMovement.findMany({
    where: { type: "RECEPCION", pasajeId: null, inQuantity: { gt: 0 }, date: { gte: from } },
    select: { id: true, client: true, clientCode: true, inQuantity: true, date: true, voucher: true },
  });
  return matchUrbanoReceptions(
    open.map((pasaje) => ({ id: pasaje.id, toClient: pasaje.toClient, toClientCode: pasaje.toClientCode, quantity: Number(pasaje.quantity), requestDate: pasaje.requestDate, createdAt: pasaje.createdAt })),
    receptions.map((item) => ({ id: item.id, client: item.client, clientCode: item.clientCode, quantity: Number(item.inQuantity), date: item.date, voucher: item.voucher })),
  );
}

export async function listPasajes(actor: PasajeActor, status?: string) {
  const rows = await excelPostgres.pasajeRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ createdAt: "desc" }, { sourceRow: "asc" }],
    include: { batch: { select: { fileName: true, requestDate: true } } },
  });
  const { matches, review } = await urbanoMatches(rows.filter((row) => OPEN_STATUSES.includes(row.status)));
  const informed = new Map<string, { received: number; vouchers: string[]; exact: boolean }>();
  for (const item of review) informed.set(item.pasajeId, { received: item.received, vouchers: item.vouchers, exact: false });
  for (const item of matches) informed.set(item.pasajeId, { received: item.quantity, vouchers: item.vouchers, exact: true });
  return rows
    .filter((row) => canSeePasaje(actor, row))
    .map((row) => ({ ...row, urbanoInformed: informed.get(row.id) ?? null }));
}

// Cancela un pasaje mal cargado: el stock vuelve al origen. Puede hacerlo cualquiera que lo vea.
export async function cancelPasaje(id: string, actor: PasajeActor, comment?: string) {
  const result = await excelPostgres.$transaction(async (tx) => {
    const pasaje = await tx.pasajeRequest.findUnique({ where: { id } });
    if (!pasaje) throw new PasajeAjusteError("El pasaje no existe.", 404);
    if (!OPEN_STATUSES.includes(pasaje.status)) throw new PasajeAjusteError("Ese pasaje ya fue resuelto.", 409);
    if (!canSeePasaje(actor, pasaje)) throw new PasajeAjusteError("No tenés asignado ninguno de los clientes de este pasaje.", 403);
    const now = new Date();
    const updated = await tx.pasajeRequest.update({
      where: { id },
      data: { status: "rejected", respondedBy: actor.name, respondedAt: now, responseComment: text(comment) || null },
    });
    await revertPasajeMovements(tx, id, actor.name, now);
    return updated;
  });
  invalidateIncomeGroups();
  return result;
}

// Se confirma cuánto pasó realmente (lo que informa Urbano): ingresa al destino esa cantidad y el
// egreso del origen se ajusta a ella. Si es menor a la aprobada, la diferencia vuelve al origen; con 0
// se revierte todo. Si un movimiento no existe (pasaje anterior al cambio, o egreso inactivado a mano
// en el historial), se crea: lo confirmado por Urbano tiene que quedar registrado.
async function applyConfirmation(tx: Prisma.TransactionClient, pasaje: PasajeRequest, quantityConfirmed: number, actorName: string, urbanoVoucher?: string) {
  const id = pasaje.id;
  const now = new Date();
  const updated = await tx.pasajeRequest.update({
    where: { id },
    data: { status: "confirmed", confirmedQuantity: quantityConfirmed, confirmedBy: actorName, confirmedAt: now, urbanoVoucher: urbanoVoucher ?? null },
  });
  if (quantityConfirmed === 0) {
    await revertPasajeMovements(tx, id, actorName, now);
    return updated;
  }
  if (!(await linkExistingTangoIncome(tx, pasaje, quantityConfirmed))) {
    const delivered = { quantity: quantityConfirmed, deliveredQuantity: quantityConfirmed, deliveryDate: now, pendingTangoEntry: true };
    const income = await tx.tangoIncome.updateMany({ where: { pasajeId: id }, data: delivered });
    if (income.count === 0) {
      await tx.tangoIncome.create({ data: { ...incomeForPasaje(id, pasaje, quantityConfirmed, now, actorName), ...delivered } });
    }
  }
  const egress = await tx.egress.updateMany({
    where: { pasajeId: id, deletedAt: null },
    data: { quantity: quantityConfirmed, ...(quantityConfirmed === Number(pasaje.quantity) ? {} : { modifiedBy: actorName }) },
  });
  if (egress.count === 0) {
    await tx.egress.create({ data: egressForPasaje(id, pasaje, quantityConfirmed, now, actorName) });
  }
  return updated;
}

// Confirmación a mano: para cuando lo que informó Urbano no coincide con lo pedido.
export async function confirmPasaje(id: string, confirmedQuantity: number, actor: PasajeActor) {
  const quantityConfirmed = Number(confirmedQuantity);
  if (!Number.isFinite(quantityConfirmed) || quantityConfirmed < 0) {
    throw new PasajeAjusteError("La cantidad confirmada no es válida.");
  }
  const result = await excelPostgres.$transaction(async (tx) => {
    const pasaje = await tx.pasajeRequest.findUnique({ where: { id } });
    if (!pasaje) throw new PasajeAjusteError("El pasaje no existe.", 404);
    if (!OPEN_STATUSES.includes(pasaje.status)) {
      throw new PasajeAjusteError("Ese pasaje ya fue resuelto.", 409);
    }
    if (!canConfirmPasaje(actor, pasaje)) {
      throw new PasajeAjusteError(`Solo quien generó el pasaje o tiene asignado el cliente ${pasaje.fromClient} puede confirmarlo.`, 403);
    }
    if (quantityConfirmed > Number(pasaje.quantity)) {
      throw new PasajeAjusteError(`No se puede confirmar más de lo pedido (${Number(pasaje.quantity)}).`);
    }
    return applyConfirmation(tx, pasaje, quantityConfirmed, actor.name);
  });
  invalidateIncomeGroups();
  return result;
}

// Confirma los pasajes cuya recepción ya informó Urbano. Corre después de cada carga de movimientos.
// Cada pasaje va en su propia transacción: si uno falla, los demás se confirman igual.
export async function reconcilePasajesWithUrbano() {
  const open = await excelPostgres.pasajeRequest.findMany({ where: { status: { in: OPEN_STATUSES } } });
  const { matches, review } = await urbanoMatches(open);
  const failed: { id: string; message: string }[] = [];
  let confirmed = 0;
  for (const match of matches) {
    try {
      await excelPostgres.$transaction(async (tx) => {
        const pasaje = await tx.pasajeRequest.findUnique({ where: { id: match.pasajeId } });
        if (!pasaje || !OPEN_STATUSES.includes(pasaje.status)) return;
        await applyConfirmation(tx, pasaje, match.quantity, URBANO_ACTOR, match.vouchers.join(", ").slice(0, 255));
        await tx.urbanoMovement.updateMany({ where: { id: { in: match.receptionIds } }, data: { pasajeId: pasaje.id } });
        confirmed += 1;
      });
    } catch (error) {
      failed.push({ id: match.pasajeId, message: error instanceof Error ? error.message : "No se pudo confirmar." });
    }
  }
  if (confirmed > 0) invalidateIncomeGroups();
  return { confirmed, toReview: review.length, failed };
}

// Confirma varios pasajes con su cantidad real.
export async function confirmPasajes(items: { id: string; quantity: number }[], actor: PasajeActor) {
  if (!Array.isArray(items) || items.length === 0) throw new PasajeAjusteError("No hay pasajes para confirmar.");
  if (items.length > 300) throw new PasajeAjusteError("Se pueden confirmar hasta 300 pasajes por vez.");
  const done: string[] = [];
  const failed: { id: string; message: string }[] = [];
  for (const item of items) {
    try {
      await confirmPasaje(String(item.id), Number(item.quantity), actor);
      done.push(String(item.id));
    } catch (error) {
      failed.push({ id: String(item.id), message: error instanceof Error ? error.message : "No se pudo confirmar." });
    }
  }
  return { done, failed };
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
