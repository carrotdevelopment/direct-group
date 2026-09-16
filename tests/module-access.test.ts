import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
import { hasModule, pageModule, accessModules } from "@/lib/module-access";
import { checkApiAccess } from "@/server/lib/access";

beforeEach(() => vi.resetAllMocks());
describe("acceso por módulo", () => {
  it("admin accede a todos los módulos y a permisos", () => {
    for (const key of [...Object.keys(accessModules), "admin"]) expect(hasModule({ role: "ADMIN", moduleAccess: [] }, key)).toBe(true);
  });
  it("deniega por defecto y no hereda módulos por el rol", () => {
    expect(hasModule(null, "compras")).toBe(false);
    expect(hasModule({ role: "VENDEDOR", moduleAccess: [] }, "clientes")).toBe(false);
    expect(hasModule({ role: "VENDEDOR", moduleAccess: ["admin"] }, "admin")).toBe(false);
    expect(hasModule({ role: "VENDEDOR", moduleAccess: ["compras"] }, "precios")).toBe(false);
    expect(hasModule({ role: "VENDEDOR", moduleAccess: ["compras"] }, "compras")).toBe(true);
  });
  it("protege aliases, subrutas y páginas de administración", () => {
    expect(pageModule("/ingresos")).toBe("compras");
    expect(pageModule("/estructura-costos/123")).toBe("precios");
    expect(pageModule("/pricing")).toBe("precios");
    expect(pageModule("/permisos")).toBe("admin");
    expect(pageModule("/desconocido")).toBe("admin");
  });
  it("API rechaza anónimos, módulos no asignados y escrituras de lectura", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await checkApiAccess(["compras"]))?.status).toBe(401);
    mocks.auth.mockResolvedValue({ user: { role: "LECTURA", moduleAccess: ["compras"] } });
    expect(await checkApiAccess(["compras"])).toBeNull();
    expect((await checkApiAccess(["compras"], true))?.status).toBe(403);
    expect((await checkApiAccess(["clientes"]))?.status).toBe(403);
    expect((await checkApiAccess(["admin"]))?.status).toBe(403);
  });
  it("consulta de nuevo los permisos luego de una revocación", async () => {
    mocks.auth.mockResolvedValueOnce({ user: { role: "VENDEDOR", moduleAccess: ["compras"] } }).mockResolvedValueOnce({ user: { role: "VENDEDOR", moduleAccess: [] } });
    expect(await checkApiAccess(["compras"])).toBeNull();
    expect((await checkApiAccess(["compras"]))?.status).toBe(403);
  });
});
