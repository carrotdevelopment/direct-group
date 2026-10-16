import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));

import { attachmentDisposition, getInboxAttachment, getInboxThread, INBOX_PAGE_SIZE, listInbox } from "@/lib/mail-inbox";
import { pageModule, hasModule } from "@/lib/module-access";
import { GET as listRoute } from "@/app/api/correos/route";
import { GET as attachmentRoute } from "@/app/api/correos/adjunto/route";

const json = (body: object) => new Response(JSON.stringify(body), { status: 200 });

describe("casilla de proveedores (lectura por el puente de Apps Script)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubEnv("MAIL_RELAY_URL", "https://script.google.com/macros/s/prueba/exec");
    vi.stubEnv("MAIL_RELAY_TOKEN", "clave-prueba");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    mocks.auth.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("pide la página de la bandeja con la clave y normaliza los hilos", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true, hasMore: true, threads: [
      { id: "18f2a3b4c5d6e7f8", subject: "Lista octubre", from: "Ventas <ventas@prov.com>", date: "2026-10-15T13:00:00.000Z", snippet: "Adjunto", messageCount: 2, unread: true, hasAttachments: true },
    ] }));
    const result = await listInbox({ query: " from:prov.com ", page: 2 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ token: "clave-prueba", action: "list", query: "from:prov.com", start: 2 * INBOX_PAGE_SIZE, max: INBOX_PAGE_SIZE });
    expect(result).toMatchObject({ page: 2, hasMore: true, threads: [{ id: "18f2a3b4c5d6e7f8", messageCount: 2, unread: true, hasAttachments: true }] });
  });

  it("avisa que falta publicar la versión nueva si el puente solo sabe enviar", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: false, error: "Faltan destinatario, asunto o texto." }));
    await expect(listInbox()).rejects.toThrow("hay que publicar la nueva versión del script");
  });

  it("rechaza identificadores raros sin llamar al puente", async () => {
    await expect(getInboxThread("../../x")).rejects.toThrow("Identificador de correo inválido.");
    await expect(getInboxAttachment("abc123", -1)).rejects.toThrow("Adjunto inválido.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("abre un hilo con sus mensajes y adjuntos", async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true, thread: { id: "18f2a3b4c5d6e7f8", subject: "Lista", messages: [
      { id: "18f2b9c0d1e2f3a4", from: "a@b.com", to: "proveedores@directgroup.com.ar", cc: "", date: "2026-10-15T13:00:00.000Z", subject: "Lista", body: "Hola", attachments: [{ index: 0, name: "lista.xlsx", contentType: "application/vnd.ms-excel", size: 2048 }] },
    ] } }));
    const thread = await getInboxThread("18f2a3b4c5d6e7f8");
    expect(thread.messages[0]).toMatchObject({ id: "18f2b9c0d1e2f3a4", body: "Hola", attachments: [{ index: 0, name: "lista.xlsx", size: 2048 }] });
  });

  it("sin configuración del puente avisa en vez de fallar en silencio", async () => {
    vi.stubEnv("MAIL_RELAY_TOKEN", "");
    await expect(listInbox()).rejects.toThrow("Falta configurar el puente de correo");
  });

  it("el nombre del adjunto no puede romper el encabezado de descarga", () => {
    expect(attachmentDisposition('lista "octubre"\r\n.xlsx')).toBe(`attachment; filename="lista octubre.xlsx"; filename*=UTF-8''${encodeURIComponent('lista "octubre"\r\n.xlsx')}`);
    expect(attachmentDisposition("Precios Año.xlsx")).toContain('filename="Precios Ano.xlsx"');
  });

  it("la sección usa su propio permiso", () => {
    expect(pageModule("/correos")).toBe("correos");
    expect(hasModule({ role: "VENDEDOR", moduleAccess: ["stock"] }, "correos")).toBe(false);
    expect(hasModule({ role: "VENDEDOR", moduleAccess: ["correos"] }, "correos")).toBe(true);
  });

  it("la API exige el permiso Correos y descarga los adjuntos siempre como archivo", async () => {
    mocks.auth.mockResolvedValue({ user: { role: "VENDEDOR", moduleAccess: ["stock"] } });
    expect((await listRoute(new Request("http://localhost/api/correos"))).status).toBe(403);

    mocks.auth.mockResolvedValue({ user: { role: "VENDEDOR", moduleAccess: ["correos"] } });
    fetchMock.mockResolvedValueOnce(json({ ok: true, name: "pagina.html", contentType: "text/html", data: Buffer.from("<script>x</script>").toString("base64") }));
    const response = await attachmentRoute(new Request("http://localhost/api/correos/adjunto?messageId=18f2b9c0d1e2f3a4&index=0"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment;/);
    expect(await response.text()).toBe("<script>x</script>");
  });
});
