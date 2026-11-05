import { beforeEach, describe, expect, it, vi } from "vitest";

// Base en memoria con lo justo para seguir los movimientos de un pasaje.
type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({
  pasajes: [] as Record<string, unknown>[],
  egresses: [] as Record<string, unknown>[],
  incomes: [] as Record<string, unknown>[],
  clientCodes: [] as Record<string, unknown>[],
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
    },
  };
  return {
    excelPostgres: {
      ...tx,
      excelClientCode: { findFirst: async () => ({ uniqueCode: "30433" }) },
      $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    },
  };
});

import { confirmPasaje, createPasaje, respondPasaje } from "@/lib/pasajes-ajustes-db";

const creator = { name: "Emilia", role: "ADMIN", clients: [] };
const receiver = { name: "Liz", role: "VENDEDOR", clients: ["Umiles"] };
const input = {
  fromClient: "Pampa", fromClientCode: "76-5030",
  toClient: "Umiles", toClientCode: "DG-1",
  uniqueCode: "30433", product: "Mochila", quantity: 10,
};

beforeEach(() => {
  db.pasajes.length = 0;
  db.egresses.length = 0;
  db.incomes.length = 0;
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

  it("al rechazarlo se inactiva el egreso y se borra el ingreso pendiente", async () => {
    const pasaje = await createPasaje(input, creator);
    Object.assign(db.pasajes[0], { status: "pending" });
    await respondPasaje(pasaje.id, "reject", receiver);
    expect(db.egresses[0]).toMatchObject({ deletedBy: "Liz", deletedAt: expect.any(Date) });
    expect(db.incomes).toEqual([]);
  });

  it("al aprobarlo no cambia ningún movimiento", async () => {
    const pasaje = await createPasaje(input, creator);
    Object.assign(db.pasajes[0], { status: "pending" });
    await respondPasaje(pasaje.id, "approve", receiver);
    expect(db.egresses[0]).toMatchObject({ quantity: 10, deletedAt: null });
    expect(db.incomes[0]).toMatchObject({ deliveredQuantity: 0 });
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

  it("rechazar nunca borra una fila que vino de Tango", async () => {
    const pasaje = await createPasaje(input, creator);
    Object.assign(db.pasajes[0], { status: "pending" });
    db.incomes.push(tangoRow({ pasajeId: pasaje.id }));
    await respondPasaje(pasaje.id, "reject", receiver);
    expect(db.incomes).toEqual([expect.objectContaining({ id: "tango-1" })]);
  });

  it("si inactivaron el egreso a mano, confirmar lo vuelve a registrar", async () => {
    const pasaje = await createPasaje(input, creator);
    Object.assign(db.pasajes[0], { status: "approved" });
    db.egresses[0].deletedAt = new Date();
    await confirmPasaje(pasaje.id, 10, creator);
    expect(db.egresses.filter((row) => row.deletedAt === null)).toEqual([expect.objectContaining({ quantity: 10 })]);
  });
});
