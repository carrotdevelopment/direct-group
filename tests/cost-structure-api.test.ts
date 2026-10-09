vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "admin", role: "ADMIN", moduleAccess: [] } })) }));
vi.mock("server-only", () => ({}));
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  readClientCodesFromPostgres: vi.fn(), readClientsFromPostgres: vi.fn(),
  readClientRatesFromPostgres: vi.fn(), readFreightCriteriaFromPostgres: vi.fn(),
  readPricesFromPostgres: vi.fn(), readProductsFromPostgres: vi.fn(),
  readSantanderCostsFromPostgres: vi.fn(), replaceSantanderCostsInPostgres: vi.fn(), deleteSantanderCostFromPostgres: vi.fn(),
  upsertSantanderCostsInPostgres: vi.fn(), upsertFreightCriterionInPostgres: vi.fn(),
}));
vi.mock("@/lib/postgres-replica-db", () => db);
import { GET, PUT, PATCH, DELETE } from "@/app/api/local-db/cost-structures/route";

const saved = {
  client: "Santander", uniqueCode: "A", clientCode: "OLD", period: "2026-06", year: 2026, month: 6,
  date: "2026-06-01", product: "Producto", supplier: "Proveedor", category: "Cat",
  costDgNoVat: 100, publicPrice: 242, vatRate: 21, markup: 10, freightNoVat: 10,
  pvcNoVat: 200, pvcWithVat: 242,
};
const rate = (effectiveFrom: string, valuePct: number, rateKey = "seguro", appliesTo = "COSTO", applies = true) => ({
  id: rateKey, clientId: "1", effectiveFrom, valuePct, rateKey, appliesTo, applies, rateName: rateKey, sortOrder: 1,
});
const request = (method: string, body: object) => new Request("http://localhost/api/local-db/cost-structures", { method, body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  db.readClientsFromPostgres.mockResolvedValue([{ id: "1", name: "Santander" }]);
  db.readClientRatesFromPostgres.mockResolvedValue([
    rate("2026-06", 2), rate("2026-06", 5, "cargo_adicional", "PRECIO"),
    rate("2026-06", 90, "inactivo", "PRECIO", false), rate("2026-09", 50),
    { ...rate("2026-06", 80), clientId: "otro" },
  ]);
  db.readClientCodesFromPostgres.mockResolvedValue([
    { uniqueCode: "A", client: "Santander", clientCode: "OLD", assignedYear: 2026, assignedMonth: 6, active: true },
    { uniqueCode: "A", client: "Santander", clientCode: "FUTURE", assignedYear: 2026, assignedMonth: 9, active: true },
    { uniqueCode: "B", client: "Santander", clientCode: "VOID", assignedYear: 2026, assignedMonth: 6, active: true, voidedAt: "2026-06-01" },
  ]);
  db.readProductsFromPostgres.mockResolvedValue([]);
  db.readFreightCriteriaFromPostgres.mockResolvedValue({});
  db.readSantanderCostsFromPostgres.mockResolvedValue([saved]);
  db.readPricesFromPostgres.mockResolvedValue([
    { uniqueCode: "A", informedAt: "2026-07-01", costDg: 120, publicPrice: 300, vatRate: 0, markup: 0 },
    { uniqueCode: "A", informedAt: "2026-09-01", costDg: 900, publicPrice: 900, vatRate: 21, markup: 10 },
  ]);
});

describe("estructura de costos: API con persistencia simulada", () => {
  it("mantiene fecha y valores del último ajuste al cambiar el período consultado", async () => {
    const latest = { ...saved, period: "2026-09", month: 9, freightNoVat: 70, pvcNoVat: 300, pvcWithVat: 363 };
    db.readSantanderCostsFromPostgres.mockResolvedValue([saved, latest]);
    db.readFreightCriteriaFromPostgres.mockResolvedValue({ A: [{ mode: "fixed", value: 999, effectiveFrom: "2026-07" }] });
    for (const month of [7, 8, 9]) {
      const data = await (await GET(new Request(`http://localhost/api/local-db/cost-structures?client=Santander&year=2026&month=${month}`))).json();
      const old = data.rows.find((row: { clientCode: string }) => row.clientCode === "OLD");
      expect(old.previousAdjustment).toEqual({ period: "2026-09", freightNoVat: 70, pvcNoVat: 300, pvcWithVat: 363 });
      expect(old.freightNoVat).toBe(999);
    }
  });

  it("sin ajustes guardados deja la referencia anterior vacía", async () => {
    db.readSantanderCostsFromPostgres.mockResolvedValue([]);
    const data = await (await GET(new Request("http://localhost/api/local-db/cost-structures?client=Santander&year=2026&month=8"))).json();
    expect(data.rows[0].previousAdjustment).toBeNull();
  });
  it("consulta códigos y precios históricos, conserva costo aplicado y acepta IVA/markup cero", async () => {
    const response = await GET(new Request("http://localhost/api/local-db/cost-structures?client=Santander&year=2026&month=8"));
    const data = await response.json();
    expect(data.source).toBe("postgresql");
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toMatchObject({ clientCode: "OLD", costDgNoVat: 100, latestSupplierCostDg: 120, hasPriceAlert: true, vatRate: 0, markup: 0, pvcUpdatedAt: "2026-06" });
  });

  it("un IVA ausente no sustituye la alícuota guardada por cero", async () => {
    db.readPricesFromPostgres.mockResolvedValue([{ uniqueCode: "A", informedAt: "2026-07-01", costDg: 120, publicPrice: 300, vatRate: 0, markup: 0, missingFields: ["vatRate", "markup"] }]);
    const data = await (await GET(new Request("http://localhost/api/local-db/cost-structures?client=Santander&year=2026&month=8"))).json();
    expect(data.rows[0]).toMatchObject({ vatRate: 21, markup: 10 });
  });

  it("guarda con tasas históricas de la base, incluye conceptos adicionales e ignora tasas del navegador", async () => {
    await PUT(request("PUT", { client: "Santander", year: 2026, month: 8, rows: [saved], rates: { insurance: 99 } }));
    expect(db.upsertSantanderCostsInPostgres).toHaveBeenCalledWith([expect.objectContaining({ period: "2026-08", insurance: 2, totalCost: 122, profit: 78, profitPercentage: 63.93 })]);
    expect(db.replaceSantanderCostsInPostgres).not.toHaveBeenCalled();
  });

  it("editar historia usa las tasas del período y escribe solamente la fila editada", async () => {
    const response = await PATCH(request("PATCH", { client: "Santander", uniqueCode: "A", period: "2026-06", freightNoVat: 20 }));
    expect(response.status).toBe(200);
    expect(db.upsertSantanderCostsInPostgres).toHaveBeenCalledWith([expect.objectContaining({ totalCost: 132, profit: 68, profitPercentage: 51.52 })]);
    expect(db.replaceSantanderCostsInPostgres).not.toHaveBeenCalled();
  });

  it("sin configuración vigente no inventa las tasas anteriores por defecto", async () => {
    db.readClientRatesFromPostgres.mockResolvedValue([rate("2026-09", 50)]);
    await PUT(request("PUT", { client: "Santander", year: 2026, month: 8, rows: [saved] }));
    expect(db.upsertSantanderCostsInPostgres).toHaveBeenCalledWith([expect.objectContaining({ insurance: 0, totalCost: 110, profit: 90 })]);
  });
});

describe("estructura de costos: un producto con varios códigos cliente", () => {
  const umiles = (clientCode: string, extra: object = {}) => ({
    ...saved, client: "Umiles", clientCode, uniqueCode: "A", period: "2026-07", month: 7, ...extra,
  });
  const get = async (month: number) =>
    (await (await GET(new Request(`http://localhost/api/local-db/cost-structures?client=Umiles&year=2026&month=${month}`))).json()).rows as
      Array<{ id: string; clientCode: string; segment: string; pvcNoVat: number; previousAdjustment: { period: string } | null; pvcHistory: unknown[] }>;

  beforeEach(() => {
    db.readClientsFromPostgres.mockResolvedValue([{ id: "2", name: "Umiles" }]);
  });

  it("muestra cada código vigente con su propio PVC", async () => {
    db.readClientCodesFromPostgres.mockResolvedValue([
      { uniqueCode: "A", client: "Umiles", clientCode: "URB-013", assignedYear: 2026, assignedMonth: 1, active: true },
      { uniqueCode: "A", client: "Umiles", clientCode: "URB-148", assignedYear: 2026, assignedMonth: 3, active: true },
    ]);
    db.readSantanderCostsFromPostgres.mockResolvedValue([
      umiles("URB-013", { pvcNoVat: 467 }), umiles("URB-148", { pvcNoVat: 459 }),
    ]);
    const rows = await get(8);
    expect(rows.map((row) => [row.id, row.pvcNoVat])).toEqual([["URB-013", 467], ["URB-148", 459]]);
  });

  it("un código vigente sin costos no toma el PVC de otro código vigente del mismo producto", async () => {
    db.readClientCodesFromPostgres.mockResolvedValue([
      { uniqueCode: "A", client: "Umiles", clientCode: "URB-013", assignedYear: 2026, assignedMonth: 1, active: true },
      { uniqueCode: "A", client: "Umiles", clientCode: "URB-148", assignedYear: 2026, assignedMonth: 3, active: true },
    ]);
    db.readSantanderCostsFromPostgres.mockResolvedValue([umiles("URB-148", { pvcNoVat: 459 })]);
    const rows = await get(8);
    expect(rows.find((row) => row.clientCode === "URB-013")).toMatchObject({ pvcNoVat: 0, previousAdjustment: null, pvcHistory: [] });
  });

  it("un producto que pasó a un código nuevo conserva la historia del código anterior", async () => {
    db.readClientCodesFromPostgres.mockResolvedValue([
      { uniqueCode: "A", client: "Umiles", clientCode: "URB-OLD", assignedYear: 2026, assignedMonth: 1, active: false },
      { uniqueCode: "A", client: "Umiles", clientCode: "URB-NEW", assignedYear: 2026, assignedMonth: 8, active: true },
    ]);
    db.readSantanderCostsFromPostgres.mockResolvedValue([umiles("URB-OLD", { pvcNoVat: 400 })]);
    const rows = await get(8);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clientCode: "URB-NEW", segment: "active", pvcNoVat: 400, previousAdjustment: { period: "2026-07" } });
  });

  it("editar y borrar el historial identifican la fila por código cliente", async () => {
    db.readSantanderCostsFromPostgres.mockResolvedValue([
      umiles("URB-013", { pvcNoVat: 467 }), umiles("URB-148", { pvcNoVat: 459 }),
    ]);
    const patched = await PATCH(request("PATCH", { client: "Umiles", clientCode: "urb-148", uniqueCode: "A", period: "2026-07", pvcNoVat: 500 }));
    expect(patched.status).toBe(200);
    expect(db.upsertSantanderCostsInPostgres).toHaveBeenCalledWith([expect.objectContaining({ clientCode: "URB-148", pvcNoVat: 500 })]);

    db.deleteSantanderCostFromPostgres.mockResolvedValue(1);
    await DELETE(new Request("http://localhost/api/local-db/cost-structures?client=Umiles&clientCode=URB-013&uniqueCode=A&period=2026-07", { method: "DELETE" }));
    expect(db.deleteSantanderCostFromPostgres).toHaveBeenCalledWith("Umiles", { clientCode: "URB-013", uniqueCode: "A" }, "2026-07");
  });
});

describe("estructura de costos: varios clientes", () => {
  const umilesSaved = { ...saved, client: "Umiles", clientCode: "URB-001", uniqueCode: "A", costDgNoVat: 500, pvcNoVat: 900, pvcWithVat: 1089, period: "2026-07", month: 7 };

  beforeEach(() => {
    db.readClientsFromPostgres.mockResolvedValue([{ id: "1", name: "Santander" }, { id: "2", name: "Umiles" }]);
    db.readClientCodesFromPostgres.mockResolvedValue([
      { uniqueCode: "A", client: "Santander", clientCode: "OLD", assignedYear: 2026, assignedMonth: 6, active: true },
      { uniqueCode: "A", client: "Umiles", clientCode: "URB-001", assignedYear: 2026, assignedMonth: 1, active: true },
    ]);
    db.readSantanderCostsFromPostgres.mockResolvedValue([saved, umilesSaved]);
  });

  it("cada cliente ve solo sus códigos y sus costos guardados", async () => {
    const umiles = await (await GET(new Request("http://localhost/api/local-db/cost-structures?client=Umiles&year=2026&month=8"))).json();
    expect(umiles.rows).toHaveLength(1);
    expect(umiles.rows[0]).toMatchObject({ clientCode: "URB-001", costDgNoVat: 500, pvcNoVat: 900 });
    const santander = await (await GET(new Request("http://localhost/api/local-db/cost-structures?client=Santander&year=2026&month=8"))).json();
    expect(santander.rows).toHaveLength(1);
    expect(santander.rows[0]).toMatchObject({ clientCode: "OLD", costDgNoVat: 100 });
  });

  it("un cliente sin códigos devuelve un aviso en vez de filas de otro cliente", async () => {
    db.readClientsFromPostgres.mockResolvedValue([{ id: "1", name: "Santander" }, { id: "3", name: "Pampa" }]);
    const data = await (await GET(new Request("http://localhost/api/local-db/cost-structures?client=Pampa&year=2026&month=8"))).json();
    expect(data.rows).toHaveLength(0);
    expect(data.message).toContain("Pampa");
  });

  it("guarda con el nombre del cliente elegido y rechaza clientes que no existen", async () => {
    await PUT(request("PUT", { client: "umiles", year: 2026, month: 8, rows: [{ ...saved, clientCode: "URB-001" }] }));
    expect(db.upsertSantanderCostsInPostgres).toHaveBeenCalledWith([expect.objectContaining({ client: "Umiles", period: "2026-08" })]);
    const rejected = await PUT(request("PUT", { client: "Inexistente", year: 2026, month: 8, rows: [saved] }));
    expect(rejected.status).toBe(400);
  });
});
