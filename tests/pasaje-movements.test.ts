import { beforeEach, describe, expect, it, vi } from "vitest";

// Base en memoria con lo justo para seguir los movimientos de un pasaje.
type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  pasajes: [] as Record<string, unknown>[],
  egresses: [] as Record<string, unknown>[],
  incomes: [] as Record<string, unknown>[],
  clientCodes: [] as Record<string, unknown>[],
  movements: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/postgres-operation-db", () => ({ invalidateIncomeGroups: vi.fn() }));
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
      findFirst: async ({ where }: { where: { clientCode: { equals: string }; deliveredQuantity: number; operation: { in: string[] }; deliveryDate: { gte: Date } } }) =>
        db.incomes.find((row) => row.externalKey && !row.pasajeId && row.clientCode === where.clientCode.equals && row.deliveredQuantity === where.deliveredQuantity &&
          where.operation.in.includes(row.operation as string) && (row.deliveryDate as Date) >= where.deliveryDate.gte) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Row }) => Object.assign(db.incomes.find((row) => row.id === where.id)!, data),
    },
    pasajeRequest: {
      ...table(() => db.pasajes),
      findUnique: async ({ where }: { where: { id: string } }) => db.pasajes.find((row) => row.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Row }) => Object.assign(db.pasajes.find((row) => row.id === where.id)!, data),
      findMany: async ({ where }: { where: { status: { in: string[] } } }) => db.pasajes.filter((row) => where.status.in.includes(row.status as string)),
    },
    urbanoMovement: {
      findMany: async ({ where }: { where: { type?: string; pasajeOutgoing?: boolean } }) =>
        db.movements.filter((row) => row.pasajeId === null && (!where.type || row.type === where.type) &&
          (where.pasajeOutgoing === undefined || row.pasajeOutgoing === where.pasajeOutgoing)),
      updateMany: async ({ where, data }: { where: { id: number | { in: number[] }; pasajeId?: null }; data: Row }) => {
        const ids = typeof where.id === "number" ? [where.id] : where.id.in;
        const found = db.movements.filter((row) => ids.includes(row.id as number) && (where.pasajeId !== null || row.pasajeId === null));
        found.forEach((row) => Object.assign(row, data));
        return { count: found.length };
      },
    },
    excelClientCode: {
      findMany: async () => db.clientCodes,
      findFirst: async ({ where }: { where: { client: { equals: string }; clientCode: { equals: string } } }) =>
        db.clientCodes.find((row) => String(row.client).toLowerCase() === where.client.equals.toLowerCase() &&
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
  cancelPasaje, confirmPasaje, createPasajesFromUrbano, createPasajeWithMovements, reconcilePasajesWithUrbano, setPasajeDestination,
} from "@/lib/pasajes-ajustes-db";

const creator = { name: "Emilia", role: "ADMIN", clients: [] };
const receiver = { name: "Liz", role: "VENDEDOR", clients: ["Umiles"] };
const input = {
  fromClient: "Pampa", fromClientCode: "76-5030",
  toClient: "Umiles", toClientCode: "DG-1",
  uniqueCode: "30433", product: "Mochila", quantity: 10,
};

// Un pasaje con destino, como los que se cargaban antes a mano.
const createPasaje = (data: typeof input, actor: { name: string }) =>
  createPasajeWithMovements(excelPostgres as never, { ...data, comments: null, createdBy: actor.name });

const code = (client: string, clientCode: string, uniqueCode: string, active = true) => ({ client, clientCode, uniqueCode, active, voidedAt: null });

beforeEach(() => {
  db.pasajes.length = 0;
  db.egresses.length = 0;
  db.incomes.length = 0;
  db.movements.length = 0;
  db.clientCodes.splice(0, db.clientCodes.length, code("Pampa", "76-5030", "30433"), code("Umiles", "DG-1", "30433"), code("Amex", "AM-9", "30433"), code("Amex", "AM-1", "otro"));
});

describe("movimientos de un pasaje", () => {
  it("al crearlo egresa del origen y deja el ingreso pendiente, sin entregado", async () => {
    const pasaje = await createPasaje(input, creator);
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
    await cancelPasaje(pasaje.id, receiver);
    expect(db.pasajes[0]).toMatchObject({ status: "rejected", respondedBy: "Liz" });
    expect(db.egresses[0]).toMatchObject({ deletedBy: "Liz", deletedAt: expect.any(Date) });
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
    Object.assign(db.pasajes[0], { status: "pending" });
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
    await cancelPasaje(pasaje.id, receiver);
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

describe("pasajes creados desde las salidas de Urbano", () => {
  const salida = (overrides: Row = {}) => ({
    id: 50, type: "PICKING", pasajeOutgoing: true, pasajeId: null, clientCode: "76-5030", company: "315", product: "Mochila",
    outQuantity: 10, date: new Date("2026-11-10T18:18:33Z"), voucher: "E10010061768692", ...overrides,
  });

  it("crea el pasaje sin destino, egresa del origen con la fecha de la salida y no la vuelve a usar", async () => {
    db.movements.push(salida());
    expect(await createPasajesFromUrbano()).toEqual({ created: 1, withoutCode: [], failed: [] });
    expect(db.pasajes[0]).toMatchObject({
      status: "no_destination", fromClient: "Pampa", fromClientCode: "76-5030", toClient: "", uniqueCode: "30433", quantity: 10,
      createdBy: "Urbano (automático)", comments: "Salida de Urbano E10010061768692", requestDate: new Date("2026-11-10T00:00:00Z"),
    });
    expect(db.egresses).toEqual([expect.objectContaining({
      client: "Pampa", quantity: 10, destination: null, date: new Date("2026-11-10T18:18:33Z"), comments: expect.stringContaining("destino a definir"),
    })]);
    expect(db.incomes).toEqual([]);
    expect(db.movements[0]).toMatchObject({ pasajeId: db.pasajes[0].id });

    expect(await createPasajesFromUrbano()).toEqual({ created: 0, withoutCode: [], failed: [] });
    expect(db.pasajes).toHaveLength(1);
  });

  it("ignora los picking que no son pasaje y saltea los códigos que no están en Códigos Cliente", async () => {
    db.movements.push(salida({ id: 51, pasajeOutgoing: false }), salida({ id: 52, clientCode: "NO-EXISTE", voucher: "X1" }));
    expect(await createPasajesFromUrbano()).toEqual({ created: 0, withoutCode: ["NO-EXISTE (X1)"], failed: [] });
    expect(db.pasajes).toEqual([]);
    expect(db.movements.every((row) => row.pasajeId === null)).toBe(true);
  });

  it("al elegir el destino queda esperando a Urbano y se confirma con la recepción", async () => {
    db.movements.push(salida());
    await createPasajesFromUrbano();
    const id = db.pasajes[0].id as string;
    await setPasajeDestination(id, "umiles", "dg-1", receiver);
    expect(db.pasajes[0]).toMatchObject({ status: "pending", toClient: "Umiles", toClientCode: "DG-1" });
    expect(db.egresses[0]).toMatchObject({ destination: "Umiles", comments: expect.stringContaining("Pasaje a Umiles (DG-1)") });
    expect(db.incomes).toEqual([expect.objectContaining({ client: "Umiles", clientCode: "DG-1", quantity: 10, deliveredQuantity: 0, transferOrigin: "Pampa" })]);

    db.movements.push({ id: 60, type: "RECEPCION", client: "Umiles", clientCode: "DG-1", inQuantity: 10, date: new Date("2026-11-12T12:00:00Z"), voucher: "R1", pasajeId: null });
    expect(await reconcilePasajesWithUrbano()).toEqual({ confirmed: 1, toReview: 0, failed: [] });
    expect(db.incomes).toEqual([expect.objectContaining({ deliveredQuantity: 10 })]);
  });

  it("se puede corregir el destino antes de confirmar, sin duplicar el ingreso", async () => {
    db.movements.push(salida());
    await createPasajesFromUrbano();
    const id = db.pasajes[0].id as string;
    await setPasajeDestination(id, "Umiles", "DG-1", receiver);
    await setPasajeDestination(id, "Amex", "AM-9", receiver);
    expect(db.pasajes[0]).toMatchObject({ toClient: "Amex", toClientCode: "AM-9" });
    expect(db.incomes).toEqual([expect.objectContaining({ client: "Amex", clientCode: "AM-9" })]);
  });

  it("no acepta un destino con otro código único ni el mismo cliente del origen", async () => {
    db.movements.push(salida());
    await createPasajesFromUrbano();
    const id = db.pasajes[0].id as string;
    await expect(setPasajeDestination(id, "Amex", "AM-1", receiver)).rejects.toThrow("código único 30433");
    await expect(setPasajeDestination(id, "Pampa", "76-5030", receiver)).rejects.toThrow("mismo cliente");
    expect(db.pasajes[0]).toMatchObject({ status: "no_destination" });
  });

  it("al cancelarlo vuelve el stock al origen y la salida no crea otro pasaje", async () => {
    db.movements.push(salida());
    await createPasajesFromUrbano();
    await cancelPasaje(db.pasajes[0].id as string, receiver);
    expect(db.pasajes[0]).toMatchObject({ status: "rejected" });
    expect(db.egresses[0].deletedAt).toBeInstanceOf(Date);
    expect(await createPasajesFromUrbano()).toEqual({ created: 0, withoutCode: [], failed: [] });
  });
});
