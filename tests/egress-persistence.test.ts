import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  egressImportProfile: { upsert: vi.fn(), findMany: vi.fn() },
  excelClientCode: { findMany: vi.fn(), findFirst: vi.fn() }, excelProduct: { findMany: vi.fn() },
  egressImportBatch: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  egress: { findMany: vi.fn(), findFirst: vi.fn(), createMany: vi.fn(), count: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  egressRawRow: { createManyAndReturn: vi.fn() }, $executeRaw: vi.fn(), $transaction: vi.fn(),
}));
vi.mock("@/lib/excel-postgres-client-core", () => ({ excelPostgres: db }));
import { appendGenericEgressRecords, deactivateEgressScope, defaultEgressProfiles, DuplicateEgressImportError, updateGenericEgress } from "@/lib/generic-egress-db";
import { egressSourceHash } from "@/lib/egress-controls";

const record = { SKU: "A", Cantidad: 2, Dia: 9, Mes: 9, Año: 2026, Canje: "001" };
beforeEach(() => {
  vi.resetAllMocks();
  db.egressImportProfile.findMany.mockResolvedValue(defaultEgressProfiles());
  db.excelClientCode.findMany.mockResolvedValue([]); db.excelProduct.findMany.mockResolvedValue([]);
  db.egressImportBatch.findUnique.mockResolvedValue(null); db.egressImportBatch.create.mockResolvedValue({ id: 1n });
  db.egress.findMany.mockResolvedValue([]); db.egress.count.mockResolvedValue(1);
  db.egressRawRow.createManyAndReturn.mockResolvedValue([{ id: 10n, sourceRowNumber: 3 }]);
  db.$transaction.mockImplementation(async callback => callback(db));
});

describe("persistencia de egresos sin base real", () => {
  it("rechaza el archivo duplicado antes de crear un lote", async () => {
    db.egressImportBatch.findUnique.mockResolvedValue({ id: 1n });
    await expect(appendGenericEgressRecords("Santander", [record], { fileHash: "hash" }, "user-1")).rejects.toBeInstanceOf(DuplicateEgressImportError);
    expect(db.egressImportBatch.create).not.toHaveBeenCalled();
  });
  it("rechaza una fila repetida en la misma subida sin insertar filas", async () => {
    await expect(appendGenericEgressRecords("Santander", [record, record], {}, "user-1")).rejects.toBeInstanceOf(DuplicateEgressImportError);
    expect(db.egress.createMany).not.toHaveBeenCalled();
    expect(db.egressImportBatch.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", fileHash: null }) }));
  });
  it("detecta registros ya cargados por otra subida y también históricos sin hash", async () => {
    for (const existing of [{ id: 7n, sourceHash: egressSourceHash(record) }, { id: 8n, sourceHash: null, rawRow: { payload: record } }]) {
      db.egress.findMany.mockResolvedValue([existing]);
      await expect(appendGenericEgressRecords("Santander", [record], {}, "user-1")).rejects.toBeInstanceOf(DuplicateEgressImportError);
    }
    expect(db.egress.createMany).not.toHaveBeenCalled();
  });
  it("guarda autor y hash y serializa las cargas concurrentes del mismo cliente", async () => {
    await appendGenericEgressRecords("Santander", [record], {}, "user-1");
    expect(db.$executeRaw).toHaveBeenCalled();
    expect(db.egress.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ createdBy: "user-1", modifiedBy: "user-1", sourceHash: egressSourceHash(record) })] });
  });
  it("la baja masiva filtra cliente y lote, sin depender del límite de la grilla", async () => {
    db.egress.updateMany.mockResolvedValue({ count: 6000 });
    expect(await deactivateEgressScope("Santander", { batchId: "42" }, "user-1")).toBe(6000);
    expect(db.egress.updateMany).toHaveBeenCalledWith({
      where: { client: "Santander", deletedAt: null, rawRow: { batchId: 42n } },
      data: { deletedAt: expect.any(Date), deletedBy: "user-1", modifiedBy: "user-1" },
    });
  });
  it("audita la edición sin cambiar el respaldo original", async () => {
    db.egress.findFirst.mockResolvedValue({ id: 1n, client: "Santander", operation: "CANJE", quantity: 1, clientCode: "A" });
    db.excelClientCode.findFirst.mockResolvedValue(null);
    await updateGenericEgress(1, "Santander", record, "user-2");
    expect(db.egress.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ modifiedBy: "user-2", quantity: 2 }) }));
    expect(db.egressRawRow.createManyAndReturn).not.toHaveBeenCalled();
  });
});
