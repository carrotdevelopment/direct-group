import { beforeEach, describe, expect, it, vi } from "vitest";

// Base en memoria con lo justo para seguir los movimientos de un pasaje.
type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  pasajes: [] as Record<string, unknown>[],
  egresses: [] as Record<string, unknown>[],
  incomes: [] as Record<string, unknown>[],
  clientCodes: [] as Record<string, unknown>[],
  movements: [] as Record<string, unknown>[],
  batches: [] as Record<string, unknown>[],
  shippers: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/postgres-operation-db", () => ({ invalidateIncomeGroups: vi.fn() }));
// Stock disponible del origen para los pasajes cargados a mano.
const stock = vi.hoisted(() => ({ available: 100 }));
vi.mock("@/lib/pasaje-stock-db", () => ({
  availableStockForCodes: async (_client: string, codes: string[]) =>
    new Map(codes.map((code) => [code.toLowerCase(), { real: stock.available, reserved: 0, available: stock.available }])),
}));
vi.mock("@/lib/excel-postgres-client", () => {
  const matches = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => row[key] === value);
  const table = (rows: () => Row[]) => ({
    create: async ({ data }: { data: Row }) => { const row = { id: `id-${rows().length + 1}`, createdAt: new Date(), deletedAt: null, externalKey: null, ...data }; rows().push(row); return row; },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const found = rows().filter((row) => matches(row, where));
      found.forEach((row) => Object.assign(row, data));
      return { count: found.length };
    },
    deleteMany: async ({ where }: { where: Row }) => {
      const kept = rows().filter((row) => !matches(row, where));
      rows().splice(0, rows().length, ...kept);
    },
  });
  const tx = {
    egress: table(() => db.egresses),
    tangoIncome: {
      ...table(() => db.incomes),
      // Fila ya importada de Tango, sin pasaje, con ese código, cantidad, operación y fecha.
      findFirst: async ({ where }: { where: { pasajeId?: string; clientCode: { equals: string }; deliveredQuantity: number; operation: { in: string[] }; deliveryDate: { gte: Date } } }) =>
        typeof where.pasajeId === "string" ? db.incomes.find((row) => row.pasajeId === where.pasajeId) ?? null : db.incomes.find((row) => row.externalKey && !row.pasajeId && row.clientCode === where.clientCode.equals && row.deliveredQuantity === where.deliveredQuantity &&
          where.operation.in.includes(row.operation as string) && (row.deliveryDate as Date) >= where.deliveryDate.gte) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Row }) => Object.assign(db.incomes.find((row) => row.id === where.id)!, data),
    },
    pasajeRequest: {
      ...table(() => db.pasajes),
      findUnique: async ({ where }: { where: { id: string } }) => db.pasajes.find((row) => row.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Row }) => Object.assign(db.pasajes.find((row) => row.id === where.id)!, data),
      findMany: async ({ where }: { where: { status: { in: string[] }; createdBy?: { not: string }; fromClientCode?: { equals: string }; quantity?: number } }) =>
        db.pasajes.filter((row) => where.status.in.includes(row.status as string) &&
          (!where.createdBy || row.createdBy !== where.createdBy.not) &&
          (!where.fromClientCode || String(row.fromClientCode).toLowerCase() === where.fromClientCode.equals.toLowerCase()) &&
          (where.quantity === undefined || Number(row.quantity) === where.quantity)),
      findFirst: async ({ where }: { where: { status: string; fromClientCode: { equals: string } } }) =>
        db.pasajes.find((row) => row.status === where.status && String(row.fromClientCode).toLowerCase() === where.fromClientCode.equals.toLowerCase()) ?? null,
    },
    urbanoMovement: {
      findMany: async ({ where }: { where: { type?: string; pasajeOutgoing?: boolean; pasajeId?: null | { not: null } } }) =>
        db.movements.filter((row) => (where.pasajeId ? row.pasajeId !== null : row.pasajeId === null) && (!where.type || row.type === where.type) &&
          (where.pasajeOutgoing === undefined || row.pasajeOutgoing === where.pasajeOutgoing)),
      updateMany: async ({ where, data }: { where: { id: number | { in: number[] }; pasajeId?: null }; data: Row }) => {
        const ids = typeof where.id === "number" ? [where.id] : where.id.in;
        const found = db.movements.filter((row) => ids.includes(row.id as number) && (where.pasajeId !== null || row.pasajeId === null));
        found.forEach((row) => Object.assign(row, data));
        return { count: found.length };
      },
    },
    pasajeBatch: table(() => db.batches),
    urbanoShipper: { findMany: async () => db.shippers },
    excelClientCode: {
      findMany: async () => db.clientCodes,
      findFirst: async ({ where }: { where: { client?: { equals: string }; clientCode: { equals: string } } }) =>
        db.clientCodes.find((row) => (!where.client || String(row.client).toLowerCase() === where.client.equals.toLowerCase()) &&
          String(row.clientCode).toLowerCase() === where.clientCode.equals.toLowerCase() && row.active && !row.voidedAt) ?? null,
    },
  };
  return {
    excelPostgres: {
      ...tx,
      $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    },
  };
});

import { excelPostgres } from "@/lib/excel-postgres-client";
import {
  approvePasaje, cancelPasaje, confirmPasaje, createPasaje as createManualPasaje, createPasajeWithMovements, linkUrbanoPasajeOutgoings,
  reconcilePasajesWithUrbano, setPasajeDestination,
} from "@/lib/pasajes-ajustes-db";

const creator = { name: "Emilia", role: "ADMIN", clients: [] };
const receiver = { name: "Liz", role: "VENDEDOR", clients: ["Umiles"] };
const input = {
  fromClient: "Pampa", fromClientCode: "76-5030",
  toClient: "Umiles", toClientCode: "DG-1",
  uniqueCode: "30433", product: "Mochila", quantity: 10,
};

// Un pasaje con destino ya aprobado por el origen, que es cuando egresa y queda el ingreso pendiente.
const createPasaje = async (data: typeof input, actor: { name: string }) => {
  const created = await createPasajeWithMovements(excelPostgres as never, { ...data, comments: null, createdBy: actor.name });
  return (await approvePasaje(created.id, creator))!;
};

const code = (client: string, clientCode: string, uniqueCode: string, active = true) => ({ client, clientCode, uniqueCode, active, voidedAt: null });

beforeEach(() => {
  stock.available = 100;
  db.batches.length = 0;
  db.shippers.splice(0, db.shippers.length, { code: "1315", name: "BCO LA PAMPA", clients: ["Pampa"], active: true }, { code: "3102", name: "UMILES/MACRO", clients: ["Umiles", "Macro"], active: true });
  db.pasajes.length = 0;
  db.egresses.length = 0;
  db.incomes.length = 0;
  db.movements.length = 0;
  db.clientCodes.splice(0, db.clientCodes.length, code("Pampa", "76-5030", "30433"), code("Umiles", "DG-1", "30433"), code("Amex", "AM-9", "30433"), code("Amex", "AM-1", "otro"));
});

describe("movimientos de un pasaje", () => {
  it("al cargarlo no mueve stock: espera la aprobación del origen", async () => {
    const pasaje = await createPasajeWithMovements(excelPostgres as never, { ...input, comments: null, createdBy: "Emilia" });
    expect(pasaje).toMatchObject({ status: "pending", egressImpacted: false });
    expect(db.egresses).toEqual([]);
    expect(db.incomes).toEqual([]);
    await cancelPasaje(pasaje.id, creator);
    expect(db.pasajes[0]).toMatchObject({ status: "rejected" });
    expect(db.egresses).toEqual([]);
  });

  it("al aprobarlo egresa del origen y deja el ingreso pendiente, sin entregado", async () => {
    const pasaje = await createPasaje(input, creator);
    expect(pasaje).toMatchObject({ status: "approved" });
    expect(pasaje).toMatchObject({ egressImpacted: true });
    expect(db.egresses).toEqual([expect.objectContaining({
      pasajeId: pasaje.id, client: "Pampa", clientCode: "76-5030", operation: "PASAJE", quantity: 10, destination: "Umiles", deletedAt: null,
    })]);
    expect(db.incomes).toEqual([expect.objectContaining({
      pasajeId: pasaje.id, client: "Umiles", clientCode: "DG-1", operation: "PASAJE", quantity: 10, deliveredQuantity: 0, transferOrigin: "Pampa",
    })]);
    expect(db.incomes[0].deliveryDate).toBeUndefined();
  });

  it("al cancelarlo se inactiva el egreso y se borra el ingreso pendiente", async () => {
    const pasaje = await createPasaje(input, creator);
    Object.assign(db.pasajes[0], { status: "pending" });
    await cancelPasaje(pasaje.id, creator);
    expect(db.pasajes[0]).toMatchObject({ status: "rejected", respondedBy: "Emilia" });
    expect(db.egresses[0]).toMatchObject({ deletedBy: "Emilia", deletedAt: expect.any(Date) });
    expect(db.incomes).toEqual([]);
  });

  it("no se puede cancelar un pasaje ya confirmado", async () => {
    const pasaje = await createPasaje(input, creator);
    Object.assign(db.pasajes[0], { status: "confirmed" });
    await expect(cancelPasaje(pasaje.id, creator)).rejects.toThrow("ya fue resuelto");
  });

  it("un pasaje que había quedado aprobado también se confirma", async () => {
    const pasaje = await createPasaje(input, creator);
    Object.assign(db.pasajes[0], { status: "approved" });
    await confirmPasaje(pasaje.id, 10, creator);
    expect(db.pasajes[0]).toMatchObject({ status: "confirmed", confirmedQuantity: 10 });
  });

  it("al confirmar el total, ingresa todo sin duplicar movimientos", async () => {
    const pasaje = await createPasaje(input, creator);
    Object.assign(db.pasajes[0], { status: "approved" });
    await confirmPasaje(pasaje.id, 10, creator);
    expect(db.egresses).toHaveLength(1);
    expect(db.incomes).toHaveLength(1);
    expect(db.incomes[0]).toMatchObject({ quantity: 10, deliveredQuantity: 10, deliveryDate: expect.any(Date), pendingTangoEntry: true });
  });

  it("al confirmar menos, la diferencia vuelve al origen", async () => {
    const pasaje = await createPasaje(input, creator);
    Object.assign(db.pasajes[0], { status: "approved" });
    await confirmPasaje(pasaje.id, 6, creator);
    expect(db.egresses[0]).toMatchObject({ quantity: 6, modifiedBy: "Emilia" });
    expect(db.incomes[0]).toMatchObject({ quantity: 6, deliveredQuantity: 6 });
  });

  it("al confirmar 0, se revierte todo", async () => {
    const pasaje = await createPasaje(input, creator);
    Object.assign(db.pasajes[0], { status: "approved" });
    await confirmPasaje(pasaje.id, 0, creator);
    expect(db.egresses[0].deletedAt).toBeInstanceOf(Date);
    expect(db.incomes).toEqual([]);
  });

  it("un pasaje anterior al cambio crea sus movimientos recién al confirmarse", async () => {
    db.pasajes.push({ id: "viejo", ...input, comments: null, createdBy: "Emilia", createdAt: new Date(), status: "approved", egressImpacted: false });
    await confirmPasaje("viejo", 4, creator);
    expect(db.egresses).toEqual([expect.objectContaining({ pasajeId: "viejo", client: "Pampa", quantity: 4 })]);
    expect(db.incomes).toEqual([expect.objectContaining({ pasajeId: "viejo", client: "Umiles", quantity: 4, deliveredQuantity: 4 })]);
  });

  const tangoRow = (overrides: Row = {}) => ({
    id: "tango-1", externalKey: "Direct_Group:STA20:1", pasajeId: null, clientCode: "DG-1", operation: "PASAJE",
    quantity: 10, deliveredQuantity: 10, deliveryDate: new Date(), pendingTangoEntry: false, ...overrides,
  });

  it("si Tango llegó antes, al confirmar se vincula esa fila y no se suma otra", async () => {
    const pasaje = await createPasaje(input, creator);
    Object.assign(db.pasajes[0], { status: "approved", createdAt: new Date() });
    db.incomes.push(tangoRow());
    await confirmPasaje(pasaje.id, 10, creator);
    expect(db.incomes).toEqual([expect.objectContaining({ id: "tango-1", pasajeId: pasaje.id, deliveredQuantity: 10, transferOrigin: "Pampa", pendingTangoEntry: false })]);
    expect(db.egresses).toHaveLength(1);
  });

  it("una fila de Tango con otra cantidad no se vincula", async () => {
    const pasaje = await createPasaje(input, creator);
    Object.assign(db.pasajes[0], { status: "approved", createdAt: new Date() });
    db.incomes.push(tangoRow({ quantity: 7, deliveredQuantity: 7 }));
    await confirmPasaje(pasaje.id, 10, creator);
    expect(db.incomes).toHaveLength(2);
    expect(db.incomes.find((row) => row.id === "tango-1")).toMatchObject({ pasajeId: null });
  });

  it("cancelar nunca borra una fila que vino de Tango", async () => {
    const pasaje = await createPasaje(input, creator);
    Object.assign(db.pasajes[0], { status: "pending" });
    db.incomes.push(tangoRow({ pasajeId: pasaje.id }));
    await cancelPasaje(pasaje.id, creator);
    expect(db.incomes).toEqual([expect.objectContaining({ id: "tango-1" })]);
  });

  it("con la recepción de Urbano se confirma solo, una sola vez", async () => {
    const pasaje = await createPasaje(input, creator);
    Object.assign(db.pasajes[0], { status: "pending", requestDate: null, createdAt: new Date("2026-11-02T12:00:00Z") });
    db.movements.push({ id: 1, type: "RECEPCION", client: "Umiles", clientCode: "dg-1", inQuantity: 10, date: new Date("2026-11-03T12:00:00Z"), voucher: "0955261102", pasajeId: null });

    expect(await reconcilePasajesWithUrbano()).toEqual({ confirmed: 1, toReview: 0, failed: [] });
    expect(db.pasajes[0]).toMatchObject({ status: "confirmed", confirmedQuantity: 10, confirmedBy: "Urbano (automático)", urbanoVoucher: "0955261102" });
    expect(db.incomes[0]).toMatchObject({ deliveredQuantity: 10, pasajeId: pasaje.id });
    expect(db.egresses[0]).toMatchObject({ quantity: 10, deletedAt: null });
    expect(db.movements[0]).toMatchObject({ pasajeId: pasaje.id });

    expect(await reconcilePasajesWithUrbano()).toEqual({ confirmed: 0, toReview: 0, failed: [] });
    expect(db.incomes).toHaveLength(1);
  });

  it("si Urbano informó otra cantidad, no confirma ni usa la recepción", async () => {
    await createPasaje(input, creator);
    Object.assign(db.pasajes[0], { status: "pending", requestDate: null, createdAt: new Date("2026-11-02T12:00:00Z") });
    db.movements.push({ id: 1, type: "RECEPCION", client: "Umiles", clientCode: "DG-1", inQuantity: 7, date: new Date("2026-11-03T12:00:00Z"), voucher: "V", pasajeId: null });

    expect(await reconcilePasajesWithUrbano()).toEqual({ confirmed: 0, toReview: 1, failed: [] });
    expect(db.pasajes[0]).toMatchObject({ status: "pending" });
    expect(db.incomes[0]).toMatchObject({ deliveredQuantity: 0 });
    expect(db.movements[0]).toMatchObject({ pasajeId: null });
  });

  it("si inactivaron el egreso a mano, confirmar lo vuelve a registrar", async () => {
    const pasaje = await createPasaje(input, creator);
    Object.assign(db.pasajes[0], { status: "approved" });
    db.egresses[0].deletedAt = new Date();
    await confirmPasaje(pasaje.id, 10, creator);
    expect(db.egresses.filter((row) => row.deletedAt === null)).toEqual([expect.objectContaining({ quantity: 10 })]);
  });
});

// Pasajes que se crearon solos desde una salida de Urbano antes del cambio: quedaron sin destino.
describe("pasajes sin destino que ya existían", () => {
  const sinDestino = async () => {
    await createPasajeWithMovements(excelPostgres as never, {
      fromClient: "Pampa", fromClientCode: "76-5030", toClient: "", toClientCode: "", uniqueCode: "30433", product: "Mochila",
      comments: "Salida de Urbano E1", quantity: 10, createdBy: "Urbano (automático)",
    });
    return db.pasajes[0].id as string;
  };

  it("al elegir el destino pasa a esperar la aprobación, que crea el ingreso pendiente sin volver a egresar", async () => {
    const id = await sinDestino();
    expect(db.incomes).toEqual([]);
    await setPasajeDestination(id, "umiles", "dg-1", receiver);
    expect(db.pasajes[0]).toMatchObject({ status: "pending", toClient: "Umiles", toClientCode: "DG-1" });
    expect(db.egresses[0]).toMatchObject({ destination: "Umiles", comments: expect.stringContaining("Pasaje a Umiles (DG-1)") });
    expect(db.incomes).toEqual([]);
    await approvePasaje(id, creator);
    expect(db.egresses).toHaveLength(1);
    expect(db.incomes).toEqual([expect.objectContaining({ client: "Umiles", clientCode: "DG-1", quantity: 10, deliveredQuantity: 0, transferOrigin: "Pampa" })]);
  });

  it("no acepta un destino con otro código único ni el mismo cliente del origen", async () => {
    const id = await sinDestino();
    await expect(setPasajeDestination(id, "Amex", "AM-1", receiver)).rejects.toThrow("código único 30433");
    await expect(setPasajeDestination(id, "Pampa", "76-5030", receiver)).rejects.toThrow("mismo cliente");
    expect(db.pasajes[0]).toMatchObject({ status: "no_destination" });
  });

  it("cualquiera lo puede cancelar y el stock vuelve al origen", async () => {
    const id = await sinDestino();
    await cancelPasaje(id, receiver);
    expect(db.pasajes[0]).toMatchObject({ status: "rejected" });
    expect(db.egresses[0].deletedAt).toBeInstanceOf(Date);
  });
});

describe("pasajes cargados en la plataforma", () => {
  const ana = { name: "Ana", role: "VENDEDOR", clients: ["Pampa"] };

  it("espera aprobación sin mover stock, guarda el aviso si no alcanzaba y al aprobarlo egresa", async () => {
    stock.available = 4;
    const pasaje = await createManualPasaje(input, receiver);
    expect(pasaje).toMatchObject({
      status: "pending", createdBy: "Liz", warning: "Se pidieron 10 con 4 disponibles en stock.", egressImpacted: false,
      fromShipper: "1315", toShipper: "3102", fromDescription: "Mochila", batchId: db.batches[0].id,
    });
    expect(db.egresses).toEqual([]);
    expect(db.incomes).toEqual([]);
    await approvePasaje(pasaje.id, ana);
    expect(db.pasajes[0]).toMatchObject({ egressImpacted: true });
    expect(db.egresses).toEqual([expect.objectContaining({ client: "Pampa", quantity: 10, destination: "Umiles", createdBy: "Ana" })]);
    expect(db.incomes).toEqual([expect.objectContaining({ client: "Umiles", clientCode: "DG-1", quantity: 10, deliveredQuantity: 0 })]);
  });

  it("sin faltante no guarda aviso", async () => {
    expect(await createManualPasaje(input, creator)).toMatchObject({ warning: null });
  });

  it("lo aprueba la encargada del origen y recién después lo confirma la del destino", async () => {
    const pasaje = await createManualPasaje(input, receiver);
    await expect(confirmPasaje(pasaje.id, 10, receiver)).rejects.toThrow("Primero lo tiene que aprobar la encargada de Pampa");
    await expect(approvePasaje(pasaje.id, receiver)).rejects.toThrow("Lo aprueba la encargada de Pampa");
    await approvePasaje(pasaje.id, ana);
    expect(db.pasajes[0]).toMatchObject({ status: "approved", respondedBy: "Ana" });
    await expect(confirmPasaje(pasaje.id, 10, ana)).rejects.toThrow("Lo confirma la encargada de Umiles");
    await confirmPasaje(pasaje.id, 10, receiver);
    expect(db.pasajes[0]).toMatchObject({ status: "confirmed", confirmedBy: "Liz" });
    expect(db.incomes[0]).toMatchObject({ deliveredQuantity: 10 });
  });

  it("si la encargada del origen lo rechaza, no se mueve stock", async () => {
    const pasaje = await createManualPasaje(input, receiver);
    await cancelPasaje(pasaje.id, ana);
    expect(db.pasajes[0]).toMatchObject({ status: "rejected", respondedBy: "Ana" });
    expect(db.egresses).toEqual([]);
    expect(db.incomes).toEqual([]);
  });

  it("si se rechaza después de aprobado, el stock vuelve al origen", async () => {
    const pasaje = await createManualPasaje(input, receiver);
    await approvePasaje(pasaje.id, ana);
    await cancelPasaje(pasaje.id, receiver);
    expect(db.egresses[0].deletedAt).toBeInstanceOf(Date);
    expect(db.incomes).toEqual([]);
  });

  it("la encargada del destino no lo puede rechazar", async () => {
    const pasaje = await createManualPasaje(input, creator);
    await expect(cancelPasaje(pasaje.id, receiver)).rejects.toThrow("encargada de Pampa o quien lo cargó");
  });

  it("no lo carga si hay un pasaje viejo de Urbano esperando destino", async () => {
    await createPasajeWithMovements(excelPostgres as never, {
      fromClient: "Pampa", fromClientCode: "76-5030", toClient: "", toClientCode: "", uniqueCode: "30433", product: null,
      comments: null, quantity: 10, createdBy: "Urbano (automático)",
    });
    await expect(createManualPasaje(input, creator)).rejects.toThrow("Sin destino");
    expect(db.egresses).toHaveLength(1);
  });
});

describe("salidas de pasaje de Urbano como control", () => {
  const salida = (overrides: Row = {}) => ({
    id: 50, type: "PICKING", pasajeOutgoing: true, pasajeId: null, clientCode: "76-5030", company: "315", product: "Mochila",
    outQuantity: 10, date: new Date(), voucher: "E1", ...overrides,
  });

  it("se vincula al pasaje cargado y no crea ninguno", async () => {
    const pasaje = await createManualPasaje(input, creator);
    db.movements.push(salida());
    expect(await linkUrbanoPasajeOutgoings()).toEqual({ matched: 1, unmatched: [], withoutCode: [] });
    expect(db.pasajes).toHaveLength(1);
    expect(db.egresses).toEqual([]);
    expect(db.movements[0]).toMatchObject({ pasajeId: pasaje.id });
  });

  it("una salida sin pasaje cargado queda para control y no toca el stock", async () => {
    db.movements.push(salida({ outQuantity: 7 }));
    expect(await linkUrbanoPasajeOutgoings()).toEqual({ matched: 0, unmatched: ["Pampa 76-5030 x7 (E1)"], withoutCode: [] });
    expect(db.pasajes).toEqual([]);
    expect(db.egresses).toEqual([]);
  });

  it("cada pasaje se vincula a una sola salida y saltea códigos desconocidos", async () => {
    await createManualPasaje(input, creator);
    db.movements.push(salida(), salida({ id: 51, voucher: "E2" }), salida({ id: 52, clientCode: "NO-EXISTE", voucher: "X1" }));
    expect(await linkUrbanoPasajeOutgoings()).toEqual({ matched: 1, unmatched: ["Pampa 76-5030 x10 (E2)"], withoutCode: ["NO-EXISTE (X1)"] });
  });

  it("al cargar el pasaje después de la salida, la vincula en el momento", async () => {
    db.movements.push(salida());
    const pasaje = await createManualPasaje(input, creator);
    expect(db.movements[0]).toMatchObject({ pasajeId: pasaje.id });
  });
});
