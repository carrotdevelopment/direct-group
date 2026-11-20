vi.mock("server-only", () => ({}));
import { beforeEach, describe, expect, it, vi } from "vitest";
const services = vi.hoisted(() => ({ products: vi.fn(), prices: vi.fn(), groupBy: vi.fn(), stockGET: vi.fn() }));
vi.mock("@/lib/postgres-replica-db", () => ({ readProductsFromPostgres: services.products, readPricesFromPostgres: services.prices }));
vi.mock("@/lib/excel-postgres-client", () => ({ excelPostgres: { egress: { groupBy: services.groupBy } } }));
vi.mock("@/app/api/local-db/stock/route", () => ({ GET: services.stockGET }));
vi.mock("@/app/api/pasajes/route", () => ({ GET: vi.fn() }));
vi.mock("@/app/api/local-db/ingresos/route", () => ({ GET: vi.fn() }));
import { assistantTools, runAssistantTool, toApiTool } from "@/lib/assistant/tools";

const names = (user: { role: string; moduleAccess: string[] }) => assistantTools(user).map((t) => t.name);
const find = (name: string) => assistantTools({ role: "ADMIN", moduleAccess: [] }).find((t) => t.name === name)!;

beforeEach(() => vi.resetAllMocks());

describe("herramientas del asistente", () => {
  it("solo ofrece las herramientas de los módulos del usuario", () => {
    expect(names({ role: "LECTURA", moduleAccess: ["stock"] })).toEqual(["guia_plataforma", "consultar_stock"]);
    expect(names({ role: "ADMIN", moduleAccess: [] })).toHaveLength(7);
  });

  it("la guía no muestra pantallas de módulos sin acceso", async () => {
    const guide = assistantTools({ role: "VENDEDOR", moduleAccess: ["pasajes"] })[0];
    const result = JSON.parse((await runAssistantTool(guide, {})).content);
    expect(result.pantallas.map((s: { path: string }) => s.path)).toEqual(["/pasajes"]);
  });

  it("rechaza parámetros inválidos sin ejecutar la consulta", async () => {
    const result = await runAssistantTool(find("consultar_egresos"), { desde: "ayer" });
    expect(result.ok).toBe(false);
    expect(services.groupBy).not.toHaveBeenCalled();
  });

  it("busca productos ignorando acentos y mayúsculas, sin inactivos", async () => {
    services.products.mockResolvedValue([
      { code: "A1", name: "Cafetera Eléctrica", active: true, brand: "", supplier: "", supplierCode: "", category: "", unitsPerPackage: 1 },
      { code: "A2", name: "Cafetera electrica vieja", active: false, brand: "", supplier: "", supplierCode: "", category: "", unitsPerPackage: 1 },
    ]);
    const result = JSON.parse((await runAssistantTool(find("buscar_productos"), { busqueda: "cafetera ELECTRICA" })).content);
    expect(result.productos.map((p: { codigoUnico: string }) => p.codigoUnico)).toEqual(["A1"]);
  });

  it("devuelve el error del endpoint cuando no hay permiso", async () => {
    services.stockGET.mockResolvedValue(Response.json({ message: "No tenés permiso para realizar esta operación." }, { status: 403 }));
    const result = await runAssistantTool(find("consultar_stock"), { cliente: "Santander" });
    expect(result).toEqual({ ok: false, content: "No tenés permiso para realizar esta operación." });
  });

  it("arma el esquema JSON de cada herramienta", () => {
    const tool = toApiTool(find("consultar_pasajes"));
    expect(tool.input_schema.type).toBe("object");
    expect(Object.keys(tool.input_schema.properties ?? {})).toEqual(["estado", "cliente", "busqueda"]);
  });
});
