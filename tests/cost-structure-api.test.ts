vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { id: "admin", role: "ADMIN", moduleAccess: [] } })) }));
vi.mock("server-only", () => ({}));
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  readClientCodesFromPostgres: vi.fn(), readClientsFromPostgres: vi.fn(),
  readClientRatesFromPostgres: vi.fn(), readFreightCriteriaFromPostgres: vi.fn(),
  readPricesFromPostgres: vi.fn(), readProductsFromPostgres: vi.fn(),
  readSantanderCostsFromPostgres: vi.fn(), replaceSantanderCostsInPostgres: vi.fn(),
  upsertSantanderCostsInPostgres: vi.fn(), upsertFreightCriterionInPostgres: vi.fn(),
}));
vi.mock("@/lib/postgres-replica-db", () => db);
import { GET, PUT, PATCH } from "@/app/api/local-db/cost-structures/route";

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
      expect(data.rows[0].previousAdjustment).toEqual({ period: "2026-09", freightNoVat: 70, pvcNoVat: 300, pvcWithVat: 363 });
      expect(data.rows[0].freightNoVat).toBe(999);
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
