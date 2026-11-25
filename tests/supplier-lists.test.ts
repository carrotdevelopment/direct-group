import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SUPPLIER_MAIL } from "@/lib/org-settings";

const listInbox = vi.fn();
const getInboxThread = vi.fn();
vi.mock("@/lib/mail-inbox", () => ({
  listInbox: (...args: unknown[]) => listInbox(...args),
  getInboxThread: (...args: unknown[]) => getInboxThread(...args),
  getInboxAttachment: vi.fn(),
}));
vi.mock("@/lib/excel-postgres-client-core", () => ({ excelPostgres: {} }));

const { findSupplierLists, mentionsSupplier } = await import("@/lib/supplier-lists");

const contact = { supplier: "RAYOVAC", contactName: "Ana", email: "ana@proveedor.test", lastSentAt: new Date("2026-11-02T17:00:00.000Z") };
const now = new Date("2026-11-25T12:00:00.000Z");
const message = (overrides: Record<string, unknown>) => ({
  id: "m1", from: "Ana <ana@proveedor.test>", to: "", cc: "", date: "2026-11-03T15:00:00.000Z", subject: "Precios", body: "", attachments: [], ...overrides,
});
const file = (name: string, index = 0) => ({ index, name, contentType: "", size: 1 });

// Cada hilo se devuelve en la búsqueda del proveedor o en la de lo enviado desde Direct Group.
function inbox(fromSupplier: string[], fromOwn: string[], threads: Record<string, unknown[]>) {
  listInbox.mockImplementation(async ({ query }: { query: string }) => ({
    threads: (query.startsWith("from:directgroup") ? fromOwn : query.startsWith("from:") ? fromSupplier : []).map((id) => ({ id, hasAttachments: true })),
    hasMore: false,
  }));
  getInboxThread.mockImplementation(async (id: string) => ({ id, subject: "Precios", messages: threads[id] }));
}
const names = async () => (await findSupplierLists([contact], now, DEFAULT_SUPPLIER_MAIL)).map((item) => [item.name, item.period]);

describe("listas de precios que llegan por correo", () => {
  beforeEach(() => { listInbox.mockReset(); getInboxThread.mockReset(); });

  it("toma los Excel de varios correos del proveedor, para el mes del pedido", async () => {
    inbox(["a", "b"], [], {
      a: [message({ id: "m1", attachments: [file("REMINGTON.xlsx"), file("logo.png", 1)] })],
      b: [message({ id: "m2", date: "2026-11-20T15:00:00.000Z", attachments: [file("BLACK+DECKER.xlsx")] })],
    });
    expect(await names()).toEqual([["REMINGTON.xlsx", "2026-11"], ["BLACK+DECKER.xlsx", "2026-11"]]);
  });

  it("no toma lo anterior al pedido ni lo que mandó Direct Group en ese hilo", async () => {
    inbox(["a"], [], {
      a: [
        message({ id: "m0", date: "2026-11-01T15:00:00.000Z", attachments: [file("vieja.xlsx")] }),
        message({ id: "m1", from: "Compras <compras@directgroup.com.ar>", attachments: [file("pedido.xlsx")] }),
      ],
    });
    expect(await names()).toEqual([]);
  });

  it("toma lo reenviado desde Direct Group si nombra al proveedor", async () => {
    inbox([], ["a", "b"], {
      a: [message({ id: "m1", from: "Compras <compras@directgroup.com.ar>", attachments: [file("RAYOVAC LISTA JULIO.xlsx")] })],
      b: [message({ id: "m2", from: "compras@directgroup.com.ar", attachments: [file("precios otro.xlsx")] })],
    });
    expect(await names()).toEqual([["RAYOVAC LISTA JULIO.xlsx", "2026-11"]]);
  });

  it("no confunde un dominio parecido con el propio", async () => {
    inbox([], ["a"], { a: [message({ from: "x@otrodirectgroup.com.ar", attachments: [file("RAYOVAC.xlsx")] })] });
    expect(await names()).toEqual([]);
  });

  it("reconoce el nombre del proveedor como palabra completa", () => {
    expect(mentionsSupplier("Fwd: Lista RAYOVAC_julio", "Rayovac")).toBe(true);
    expect(mentionsSupplier("Rayovacs", "RAYOVAC")).toBe(false);
  });
});
