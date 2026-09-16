vi.mock("server-only", () => ({}));
import { beforeEach, describe, expect, it, vi } from "vitest";
const services = vi.hoisted(() => ({
  auth: vi.fn(), appendGenericEgressRecords: vi.fn(), updateGenericEgress: vi.fn(),
  deactivateEgressScope: vi.fn(), softDeleteGenericEgresses: vi.fn(), previewEgressDeactivation: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: services.auth }));
vi.mock("@/lib/generic-egress-db", () => ({
  ...services, DuplicateEgressImportError: class extends Error {}, getGenericEgressSummary: vi.fn(),
  readGenericEgressRows: vi.fn(), readEgressBatches: vi.fn(),
}));
import { DELETE, GET, POST, PUT } from "@/app/api/local-db/egresos/route";
const request = (method: string, body: object) => new Request("http://localhost/api/local-db/egresos", {
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
beforeEach(() => {
  vi.resetAllMocks();
  services.auth.mockResolvedValue({ user: { id: "session-user", role: "ADMIN" } });
});

describe("API de egresos", () => {
  it("no permite mutaciones sin sesión ni con rol de lectura", async () => {
    for (const session of [null, { user: { id: "reader", role: "LECTURA", moduleAccess: ["ventas"] } }]) {
      services.auth.mockResolvedValue(session);
      expect((await DELETE(request("DELETE", { client: "Santander", rowIndexes: [1] }))).status).toBe(session ? 403 : 401);
    }
    expect(services.softDeleteGenericEgresses).not.toHaveBeenCalled();
  });
  it("el usuario modificador viene de la sesión, no del cuerpo enviado", async () => {
    services.updateGenericEgress.mockResolvedValue(true);
    expect((await PUT(request("PUT", { client: "Santander", rowIndex: 12, values: { Cantidad: 3 }, modifiedBy: "spoofed" }))).status).toBe(200);
    expect(services.updateGenericEgress).toHaveBeenCalledWith(12, "Santander", { Cantidad: 3 }, "session-user");
  });
  it("rechaza una baja sin alcance y acota una baja por archivo al cliente", async () => {
    expect((await DELETE(request("DELETE", { client: "Santander", scope: {} }))).status).toBe(400);
    services.deactivateEgressScope.mockResolvedValue(6000);
    const response = await DELETE(request("DELETE", { client: "Santander", scope: { batchId: "42" } }));
    expect(await response.json()).toMatchObject({ ok: true, deletedRows: 6000 });
    expect(services.deactivateEgressScope).toHaveBeenCalledWith("Santander", { batchId: "42" }, "session-user");
  });
  it("la vista previa no realiza escrituras y valida las fechas", async () => {
    expect((await GET(new Request("http://localhost/api/local-db/egresos?client=Santander&preview=1&from=2026-02-30&to=2026-03-01"))).status).toBe(400);
    services.previewEgressDeactivation.mockResolvedValue(6000);
    expect(await (await GET(new Request("http://localhost/api/local-db/egresos?client=Santander&preview=1&batchId=42"))).json()).toEqual({ count: 6000 });
    expect(services.deactivateEgressScope).not.toHaveBeenCalled();
  });
  it("devuelve conflicto al importar dos veces el mismo archivo concurrentemente", async () => {
    services.appendGenericEgressRecords.mockRejectedValue({ code: "P2002" });
    expect((await POST(request("POST", { client: "Santander", records: [{ Cantidad: 2 }] }))).status).toBe(409);
  });
});
