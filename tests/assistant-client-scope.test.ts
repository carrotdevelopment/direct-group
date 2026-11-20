vi.mock("server-only", () => ({}));
import { beforeEach, describe, expect, it, vi } from "vitest";
const services = vi.hoisted(() => ({ groupBy: vi.fn(), stockGET: vi.fn() }));
vi.mock("@/lib/postgres-replica-db", () => ({ readProductsFromPostgres: vi.fn(), readPricesFromPostgres: vi.fn() }));
vi.mock("@/lib/excel-postgres-client", () => ({ excelPostgres: { egress: { groupBy: services.groupBy } } }));
vi.mock("@/app/api/local-db/stock/route", () => ({ GET: services.stockGET }));
vi.mock("@/app/api/pasajes/route", () => ({ GET: vi.fn() }));
vi.mock("@/app/api/local-db/ingresos/route", () => ({ GET: vi.fn() }));
import { assistantTools, runAssistantTool } from "@/lib/assistant/tools";
import { assistantUserContext } from "@/lib/assistant/prompt";
import { NO_CLIENT } from "@/lib/client-scope";

const vendedora = { role: "VENDEDOR", moduleAccess: ["stock", "ventas"], pasajeClients: ["Amex", "Credicoop"] };
const tool = (user: Parameters<typeof assistantTools>[0], name: string) => assistantTools(user).find((t) => t.name === name)!;
const stockOf = (rows: object[]) => Response.json({ rows, message: "ok" });

beforeEach(() => vi.resetAllMocks());

describe("el asistente respeta los clientes asignados", () => {
  it("no consulta egresos de un cliente ajeno", async () => {
    const result = await runAssistantTool(tool(vendedora, "consultar_egresos"), { cliente: "Pampa" });
    expect(result).toEqual({ ok: false, content: "No tenés acceso a los datos de ese cliente." });
    expect(services.groupBy).not.toHaveBeenCalled();
  });

  it("sin cliente, los egresos se limitan a los clientes asignados", async () => {
    services.groupBy.mockResolvedValue([]);
    await runAssistantTool(tool(vendedora, "consultar_egresos"), {});
    const where = services.groupBy.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { client: { equals: "Amex", mode: "insensitive" } },
      { client: { equals: "Credicoop", mode: "insensitive" } },
    ]);
  });

  it("sin clientes asignados no consulta egresos de ninguno", async () => {
    services.groupBy.mockResolvedValue([]);
    await runAssistantTool(tool({ ...vendedora, pasajeClients: [] }, "consultar_egresos"), {});
    expect(services.groupBy.mock.calls[0][0].where.OR).toEqual([{ client: NO_CLIENT }]);
  });

  it("el administrador consulta egresos sin restricción de clientes", async () => {
    services.groupBy.mockResolvedValue([]);
    await runAssistantTool(tool({ role: "ADMIN", moduleAccess: [] }, "consultar_egresos"), {});
    expect(services.groupBy.mock.calls[0][0].where.OR).toBeUndefined();
  });

  it("no consulta el stock de un cliente ajeno", async () => {
    const result = await runAssistantTool(tool(vendedora, "consultar_stock"), { cliente: "Pampa" });
    expect(result).toEqual({ ok: false, content: "No tenés acceso a los datos de ese cliente." });
    expect(services.stockGET).not.toHaveBeenCalled();
  });

  it("busca un producto en todos sus clientes cuando no dice cuál", async () => {
    services.stockGET.mockImplementation(async (request: Request) => {
      const url = new URL(request.url);
      if (url.searchParams.get("clients")) return Response.json({ clients: ["Amex", "Credicoop"] });
      return url.searchParams.get("client") === "Amex"
        ? stockOf([{ clientCode: "DG99-1", uniqueCode: "u1", product: "Cafetera", vigente: true, realStock: 5 }])
        : stockOf([{ clientCode: "C-9", uniqueCode: "u1", product: "Cafetera", vigente: true, realStock: 2 }, { clientCode: "C-8", uniqueCode: "u2", product: "Pava", vigente: true, realStock: 7 }]);
    });
    const result = JSON.parse((await runAssistantTool(tool(vendedora, "consultar_stock"), { busqueda: "cafetera" })).content);
    expect(result.productos.map((p: { cliente: string; stockReal: number }) => [p.cliente, p.stockReal])).toEqual([["Amex", 5], ["Credicoop", 2]]);
  });

  it("sin búsqueda devuelve solo la lista de sus clientes", async () => {
    services.stockGET.mockResolvedValue(Response.json({ clients: ["Amex", "Credicoop"] }));
    const result = JSON.parse((await runAssistantTool(tool(vendedora, "consultar_stock"), {})).content);
    expect(result).toEqual({ clientes: ["Amex", "Credicoop"] });
  });
});

describe("contexto del asistente", () => {
  it("identifica a la usuaria y sus clientes", () => {
    const text = assistantUserContext({ name: "Betiana", email: "b@directgroup.com.ar", role: "VENDEDOR", pasajeClients: ["Amex", "Massalin"] }, ["stock"]);
    expect(text).toContain("Betiana <b@directgroup.com.ar>");
    expect(text).toContain("Atiende estos clientes: Amex, Massalin");
    expect(text).toContain("mi stock");
  });

  it("al administrador le dice que ve todos los clientes", () => {
    expect(assistantUserContext({ name: "Juan", role: "ADMIN" }, [])).toContain("ve los datos de todos los clientes");
  });

  it("sin clientes asignados avisa que no puede ver datos", () => {
    expect(assistantUserContext({ name: "Rosario", role: "VENDEDOR", pasajeClients: [] }, ["correos"])).toContain("No tiene clientes asignados");
  });
});
