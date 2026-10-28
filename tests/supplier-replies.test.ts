import { beforeEach, describe, expect, it, vi } from "vitest";

const listInbox = vi.fn();
vi.mock("@/lib/mail-inbox", () => ({ listInbox: (...args: unknown[]) => listInbox(...args) }));
vi.mock("@/lib/excel-postgres-client-core", () => ({ excelPostgres: {} }));

const { buildFollowUpMail, findSupplierReply } = await import("@/lib/supplier-mail");

const thread = (overrides: Record<string, unknown>) => ({
  id: "t1", subject: "Re: Solicitud de catálogo de productos - ACEGAME - noviembre de 2026", from: "Francisco <ftedin@acegame.com.ar>",
  date: "2026-11-03T15:00:00.000Z", snippet: "", messageCount: 2, unread: true, hasAttachments: false, ...overrides,
});
const contact = { email: "FTedin@acegame.com.ar ", supplier: "ACEGAME", lastSentAt: new Date("2026-11-02T17:00:00.000Z") };

describe("reconsulta y respuesta de proveedores", () => {
  beforeEach(() => listInbox.mockReset());

  it("la reconsulta responde al pedido del mes en que se mandó", () => {
    const mail = buildFollowUpMail("Francisco Tedin", "ACEGAME", new Date("2026-11-02T17:00:00.000Z"));
    expect(mail.subject).toBe("Re: Solicitud de catálogo de productos - ACEGAME - noviembre de 2026");
    expect(mail.text).toContain("Hola Francisco Tedin, buenas tardes.");
    expect(mail.text).toContain("¿Pudiste ver nuestro correo");
  });

  it("busca por correo o asunto desde el día anterior al envío y detecta el adjunto", async () => {
    listInbox.mockResolvedValue({ threads: [thread({ hasAttachments: true })] });
    const reply = await findSupplierReply(contact);
    expect(listInbox.mock.calls[0][0].query).toBe('{from:ftedin@acegame.com.ar subject:"Solicitud de catálogo de productos - ACEGAME - noviembre de 2026"} after:2026/11/01');
    expect(reply).toEqual({ repliedAt: new Date("2026-11-03T15:00:00.000Z"), hasAttachment: true });
  });

  it("no cuenta hilos anteriores al envío ni los que solo tienen mensajes propios", async () => {
    listInbox.mockResolvedValue({
      threads: [
        thread({ date: "2026-11-02T10:00:00.000Z" }),
        thread({ from: "Direct Group <proveedores@directgroup.com.ar>", messageCount: 1 }),
      ],
    });
    expect(await findSupplierReply(contact)).toBeNull();
  });
});

describe("plantillas de los correos a proveedores", () => {
  it("reemplaza contacto, proveedor y mes, y sin contacto no deja la coma suelta", async () => {
    const { renderMailTemplate } = await import("@/lib/org-settings");
    const values = { contacto: "", proveedor: "ACEGAME", mes: "noviembre de 2026" };
    expect(renderMailTemplate(["Hola {contacto}, buenas tardes.", "Pedido de {Proveedor} para {mes}."].join("\n"), values))
      .toBe(["Hola, buenas tardes.", "Pedido de ACEGAME para noviembre de 2026."].join("\n"));
  });

  it("los correos salen con la plantilla guardada", () => {
    const templates = {
      requestSubject: "Lista de precios {mes} - {proveedor}", requestBody: "Estimado/a {contacto}: necesitamos la lista.",
      followUpSubject: "Recordatorio {proveedor}", followUpBody: "{contacto}, ¿lo viste?",
    };
    const now = new Date("2026-11-02T17:00:00.000Z");
    expect(buildFollowUpMail("Ana", "ACEGAME", now, templates)).toEqual({ subject: "Recordatorio ACEGAME", text: "Ana, ¿lo viste?" });
  });
});

