import "server-only";
import type { PasajeRequest, Prisma } from "../node_modules/.prisma/excel-client";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { invalidateIncomeGroups } from "@/lib/postgres-operation-db";
import { tangoPasajeOperations, tangoWindowStart } from "@/lib/pasaje-tango-match";
import { matchUrbanoReceptions, urbanoSearchStart } from "@/lib/pasaje-urbano-match";
import { availableStockForCodes } from "@/lib/pasaje-stock-db";
import { urbanoCodeFinder } from "@/lib/urbano-api-rows";
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

function isSelf(actor: PasajeActor, createdBy: string) {
  return actor.role !== "ADMIN" && actor.name.trim().toLowerCase() === createdBy.trim().toLowerCase();
}

// Un operador solo puede generar ajustes de los clientes que se le asignaron en Permisos; el
// administrador no tiene restricción. Los pasajes se pueden cargar desde cualquier cliente.
function assertCanCreateFor(actor: PasajeActor, client: string) {
  if (!canActForClient(actor, client)) {
    throw new PasajeAjusteError(`No tenés asignado el cliente ${client} para generar este movimiento.`, 403);
  }
}

export function visibleToActor(actor: PasajeActor, clients: string[]) {
  return actor.role === "ADMIN" || clients.some((client) => canActForClient(actor, client));
}

// El código único identifica el producto: un pasaje solo tiene sentido si el código cliente origen y el
// destino tienen ese mismo producto asignado en Códigos Cliente. La pantalla ya filtra por esto.
async function assertSharedUniqueCode(fromClientCode: string, toClientCode: string, uniqueCode: string) {
  const [fromMapping, toMapping] = await Promise.all([
    excelPostgres.excelClientCode.findFirst({ where: { clientCode: { equals: fromClientCode, mode: "insensitive" }, active: true } }),
    excelPostgres.excelClientCode.findFirst({ where: { clientCode: { equals: toClientCode, mode: "insensitive" }, active: true } }),
  ]);
  if (!fromMapping || normalizeCode(text(fromMapping.uniqueCode)) !== normalizeCode(uniqueCode)) {
    throw new PasajeAjusteError("El código cliente origen no tiene asignado ese código único.");
  }
  if (!toMapping || normalizeCode(text(toMapping.uniqueCode)) !== normalizeCode(uniqueCode)) {
    throw new PasajeAjusteError("El código cliente destino no tiene asignado ese código único.");
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

// Valida un pasaje cargado a mano y devuelve los datos listos para guardar.
async function preparePasaje(input: PasajeInput, actor: PasajeActor) {
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new PasajeAjusteError("La cantidad tiene que ser mayor a cero.");
  if (!text(input.fromClient) || !text(input.fromClientCode)) throw new PasajeAjusteError("Completá el cliente origen y su código cliente.");
  if (!text(input.toClient) || !text(input.toClientCode)) throw new PasajeAjusteError("Completá el cliente destino y su código cliente.");
  if (
    text(input.fromClient).toLowerCase() === text(input.toClient).toLowerCase() &&
    text(input.fromClientCode).toLowerCase() === text(input.toClientCode).toLowerCase()
  ) {
    throw new PasajeAjusteError("El origen y el destino no pueden ser el mismo código cliente.");
  }
  if (!text(input.uniqueCode)) throw new PasajeAjusteError("Falta el código único del producto.");
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

// Un pasaje creado desde una salida de Urbano no tiene destino hasta que alguien lo elige.
const hasDestination = (pasaje: { toClient: string }) => pasaje.toClient.trim() !== "";

function egressComments(pasaje: PasajeMovement) {
  const target = hasDestination(pasaje) ? `Pasaje a ${pasaje.toClient} (${pasaje.toClientCode})` : "Pasaje informado por Urbano, destino a definir";
  return `${target}${pasaje.comments ? ` — ${pasaje.comments}` : ""}`;
}

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
    destination: hasDestination(pasaje) ? pasaje.toClient : null,
    comments: egressComments(pasaje),
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

// Ingreso al destino pendiente (entregado en 0, no suma stock) hasta que se confirme lo que pasó Urbano.
const pendingIncome = (pasajeId: string, pasaje: PasajeMovement, quantity: number, date: Date, createdBy: string) => ({
  ...incomeForPasaje(pasajeId, pasaje, quantity, date, createdBy), deliveredQuantity: 0,
});

// Crea el pasaje con sus movimientos: el egreso del origen impacta en el momento y, si ya tiene destino,
// el ingreso queda pendiente. Sin destino queda en no_destination, sin ingreso, hasta que alguien lo elija.
export async function createPasajeWithMovements(tx: Prisma.TransactionClient, data: NewPasaje, date = new Date()) {
  const status = hasDestination(data) ? "pending" : NO_DESTINATION;
  const pasaje = await tx.pasajeRequest.create({ data: { ...data, status, egressImpacted: true } });
  await tx.egress.create({ data: egressForPasaje(pasaje.id, data, data.quantity, date, data.createdBy) });
  if (hasDestination(data)) await tx.tangoIncome.create({ data: pendingIncome(pasaje.id, data, data.quantity, date, data.createdBy) });
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

// Pasaje cargado a mano: egresa del origen en el momento y deja el ingreso al destino pendiente hasta la
// recepción de Urbano. Si se egresa más de lo que hay en stock se carga igual (la pantalla ya avisó) y queda
// el aviso guardado en el pasaje. Si Urbano ya informó esa salida y espera destino, no se carga de nuevo:
// se elige el destino de ese pasaje, porque si no egresaría dos veces.
export async function createPasaje(input: PasajeInput, actor: PasajeActor) {
  const data = await preparePasaje(input, actor);
  const informed = await excelPostgres.pasajeRequest.findFirst({
    where: {
      status: NO_DESTINATION,
      fromClientCode: { equals: data.fromClientCode, mode: "insensitive" },
      uniqueCode: { equals: data.uniqueCode, mode: "insensitive" },
    },
  });
  if (informed) {
    throw new PasajeAjusteError(
      `Urbano ya informó una salida de ${Number(informed.quantity)} de ${informed.fromClientCode} que espera destino: elegí el destino en "Sin destino" en lugar de cargar otro pasaje.`,
      409,
    );
  }
  const available = (await availableStockForCodes(data.fromClient, [data.fromClientCode])).get(normalizeCode(data.fromClientCode))?.available ?? 0;
  const warning = data.quantity > available ? `Se egresaron ${data.quantity} con ${available} disponibles en stock.` : null;
  const pasaje = await excelPostgres.$transaction((tx) => createPasajeWithMovements(tx, { ...data, warning }));
  invalidateIncomeGroups();
  return pasaje;
}

// Estados: no_destination (Urbano informó la salida y ya egresó del origen; falta elegir el destino) →
// pending (el ingreso espera lo que informe Urbano) → confirmed (ingresó al destino lo que recibió Urbano,
// automáticamente o a mano si la cantidad no coincide). rejected es un pasaje cancelado: se revierte el
// egreso. approved es de cuando había aprobaciones: se trata igual que pending.
const OPEN_STATUSES = ["pending", "approved"];
const NO_DESTINATION = "no_destination";
const CANCELABLE_STATUSES = [...OPEN_STATUSES, NO_DESTINATION];
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
  // Sin destino todavía no se sabe a qué cliente va: lo ve cualquiera, para que lo complete quien sepa.
  return rows
    .filter((row) => row.status === NO_DESTINATION || canSeePasaje(actor, row))
    .map((row) => ({ ...row, urbanoInformed: informed.get(row.id) ?? null }));
}

// Cancela un pasaje mal cargado: el stock vuelve al origen. Puede hacerlo cualquiera que lo vea.
export async function cancelPasaje(id: string, actor: PasajeActor, comment?: string) {
  const result = await excelPostgres.$transaction(async (tx) => {
    const pasaje = await tx.pasajeRequest.findUnique({ where: { id } });
    if (!pasaje) throw new PasajeAjusteError("El pasaje no existe.", 404);
    if (!CANCELABLE_STATUSES.includes(pasaje.status)) throw new PasajeAjusteError("Ese pasaje ya fue resuelto.", 409);
    if (pasaje.status !== NO_DESTINATION && !canSeePasaje(actor, pasaje)) throw new PasajeAjusteError("No tenés asignado ninguno de los clientes de este pasaje.", 403);
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

async function activeClientCodes() {
  const codes = await excelPostgres.excelClientCode.findMany({
    select: { client: true, clientCode: true, uniqueCode: true, active: true, voidedAt: true },
  });
  return codes
    .filter((code) => code.client && code.clientCode)
    .map((code) => ({
      client: String(code.client), clientCode: String(code.clientCode), uniqueCode: String(code.uniqueCode ?? ""),
      active: code.active === true, voided: !!code.voidedAt,
    }));
}

// Un pasaje cargado a mano hasta estos días antes de la salida de Urbano se toma como el de esa salida.
const MANUAL_MATCH_DAYS = 20;

// Día de Argentina de un momento, como fecha sin hora.
const argentinaDay = (date: Date) => new Date(`${new Date(date.getTime() - 3 * 3_600_000).toISOString().slice(0, 10)}T00:00:00.000Z`);

// Crea un pasaje por cada salida de Urbano marcada como pasaje de stock que todavía no tiene uno: egresa del
// origen con la fecha de la salida y queda sin destino, porque Urbano no informa a qué cliente va. Una salida
// cuyo código no está en Códigos Cliente se saltea y se vuelve a intentar en la próxima carga.
export async function createPasajesFromUrbano() {
  const outgoing = await excelPostgres.urbanoMovement.findMany({
    where: { type: "PICKING", pasajeOutgoing: true, pasajeId: null, outQuantity: { gt: 0 } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
  const result = { created: 0, matched: 0, withoutCode: [] as string[], failed: [] as { voucher: string; message: string }[] };
  if (outgoing.length === 0) return result;
  const find = urbanoCodeFinder(await activeClientCodes());
  // Pasajes que ya tienen su salida de Urbano: no se vuelven a usar.
  const used = new Set(
    (await excelPostgres.urbanoMovement.findMany({ where: { type: "PICKING", pasajeOutgoing: true, pasajeId: { not: null } }, select: { pasajeId: true } }))
      .map((row) => row.pasajeId as string),
  );
  for (const movement of outgoing) {
    const voucher = movement.voucher ?? String(movement.id);
    const origin = find(movement.clientCode);
    if (!origin?.uniqueCode) {
      result.withoutCode.push(`${movement.clientCode} (${voucher})`);
      continue;
    }
    try {
      const matched = await excelPostgres.$transaction(async (tx) => {
        // Si alguien ya lo cargó a mano (mismo origen, producto y cantidad), esa salida es la de ese pasaje:
        // ya egresó, así que solo se vincula.
        const manual = (await tx.pasajeRequest.findMany({
          where: {
            createdBy: { not: URBANO_ACTOR },
            status: { in: [...OPEN_STATUSES, "confirmed"] },
            egressImpacted: true,
            fromClientCode: { equals: origin.clientCode, mode: "insensitive" },
            uniqueCode: { equals: origin.uniqueCode, mode: "insensitive" },
            quantity: Number(movement.outQuantity),
            createdAt: { gte: new Date(movement.date.getTime() - MANUAL_MATCH_DAYS * 86_400_000) },
          },
          orderBy: { createdAt: "asc" },
        })).find((pasaje) => !used.has(pasaje.id));
        const pasaje = manual ?? await createPasajeWithMovements(tx, {
          fromClient: origin.client,
          fromClientCode: origin.clientCode,
          toClient: "",
          toClientCode: "",
          uniqueCode: origin.uniqueCode,
          product: movement.product?.slice(0, 255) || null,
          comments: movement.voucher ? `Salida de Urbano ${movement.voucher}` : "Salida de Urbano",
          quantity: Number(movement.outQuantity),
          createdBy: URBANO_ACTOR,
          requestDate: argentinaDay(movement.date),
          fromShipper: movement.company,
        }, movement.date);
        // Si otra carga ya la usó, se deshace todo: una salida crea un solo pasaje.
        const linked = await tx.urbanoMovement.updateMany({ where: { id: movement.id, pasajeId: null }, data: { pasajeId: pasaje.id } });
        if (linked.count !== 1) throw new PasajeAjusteError("La salida ya tiene un pasaje.", 409);
        used.add(pasaje.id);
        return !!manual;
      });
      if (matched) result.matched += 1;
      else result.created += 1;
    } catch (error) {
      result.failed.push({ voucher, message: error instanceof Error ? error.message : "No se pudo crear." });
    }
  }
  if (result.created > 0) invalidateIncomeGroups();
  return result;
}

// Elige (o corrige, mientras no se confirmó) el cliente destino. El código destino tiene que tener el mismo
// código único que el origen. Después espera la recepción de Urbano, como cualquier pasaje.
export async function setPasajeDestination(id: string, toClient: string, toClientCode: string, actor: PasajeActor) {
  const client = text(toClient);
  const code = text(toClientCode);
  if (!client || !code) throw new PasajeAjusteError("Elegí el cliente destino y su código.");
  const result = await excelPostgres.$transaction(async (tx) => {
    const pasaje = await tx.pasajeRequest.findUnique({ where: { id } });
    if (!pasaje) throw new PasajeAjusteError("El pasaje no existe.", 404);
    if (!CANCELABLE_STATUSES.includes(pasaje.status)) throw new PasajeAjusteError("Ese pasaje ya fue resuelto.", 409);
    if (pasaje.status !== NO_DESTINATION && !canSeePasaje(actor, pasaje)) {
      throw new PasajeAjusteError("No tenés asignado ninguno de los clientes de este pasaje.", 403);
    }
    if (client.toLowerCase() === pasaje.fromClient.toLowerCase()) throw new PasajeAjusteError("El destino no puede ser el mismo cliente que el origen.");
    const mapping = await tx.excelClientCode.findFirst({
      where: { client: { equals: client, mode: "insensitive" }, clientCode: { equals: code, mode: "insensitive" }, active: true, voidedAt: null },
    });
    if (!mapping || normalizeCode(text(mapping.uniqueCode)) !== normalizeCode(pasaje.uniqueCode)) {
      throw new PasajeAjusteError(`${client} no tiene el código ${code} con el código único ${pasaje.uniqueCode}.`);
    }
    const updated = await tx.pasajeRequest.update({
      where: { id },
      data: { toClient: text(mapping.client), toClientCode: text(mapping.clientCode), status: "pending" },
    });
    await tx.egress.updateMany({
      where: { pasajeId: id, deletedAt: null },
      data: { destination: updated.toClient, comments: egressComments(updated), modifiedBy: actor.name },
    });
    await tx.tangoIncome.deleteMany({ where: { pasajeId: id, externalKey: null } });
    await tx.tangoIncome.create({ data: pendingIncome(id, updated, Number(pasaje.quantity), pasaje.requestDate ?? pasaje.createdAt, actor.name) });
    return updated;
  });
  invalidateIncomeGroups();
  return result;
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
