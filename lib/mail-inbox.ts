// Lectura de la casilla de proveedores (proveedores@directgroup.com.ar) a través del puente de Google
// Apps Script que también envía los correos (MAIL_RELAY_URL / MAIL_RELAY_TOKEN). Solo lectura: el
// puente no marca los correos como leídos ni cambia la casilla. Ver docs/apps-script/puente-correo.gs.

export class MailInboxError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export type InboxThread = {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  messageCount: number;
  unread: boolean;
  hasAttachments: boolean;
};

export type InboxAttachment = { index: number; name: string; contentType: string; size: number };

export type InboxMessage = {
  id: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  subject: string;
  body: string;
  attachments: InboxAttachment[];
};

export const INBOX_PAGE_SIZE = 25;

// Los identificadores de Gmail son hexadecimales; se validan antes de mandarlos al puente.
const GMAIL_ID = /^[A-Za-z0-9_-]{6,64}$/;

async function callRelay<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const url = process.env.MAIL_RELAY_URL;
  const token = process.env.MAIL_RELAY_TOKEN;
  if (!url || !token) throw new MailInboxError("Falta configurar el puente de correo (MAIL_RELAY_URL y MAIL_RELAY_TOKEN).", 503);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token, action, ...payload }),
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
  } catch {
    throw new MailInboxError("No se pudo conectar con la casilla de correo. Probá de nuevo en un momento.");
  }
  const raw = await response.text();
  let data: { ok?: boolean; error?: string } & Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new MailInboxError("El puente de correo no respondió como se esperaba. Revisá que esté publicada la última versión del script.");
  }
  if (!data.ok) {
    const error = String(data.error ?? "");
    // Un puente que todavía no tiene la versión con lectura trata el pedido como un envío.
    if (/faltan destinatario/i.test(error)) {
      throw new MailInboxError("El puente de correo todavía no permite leer la casilla: hay que publicar la nueva versión del script.", 503);
    }
    throw new MailInboxError(error || "El puente de correo rechazó el pedido.");
  }
  return data as T;
}

const text = (value: unknown) => String(value ?? "");

export async function listInbox(options: { query?: string; page?: number } = {}) {
  const page = Math.max(0, Math.floor(Number(options.page) || 0));
  const query = text(options.query).trim().slice(0, 200);
  const data = await callRelay<{ threads?: unknown[]; hasMore?: boolean }>("list", {
    query,
    start: page * INBOX_PAGE_SIZE,
    max: INBOX_PAGE_SIZE,
  });
  const threads: InboxThread[] = (Array.isArray(data.threads) ? data.threads : []).map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: text(row.id),
      subject: text(row.subject),
      from: text(row.from),
      date: text(row.date),
      snippet: text(row.snippet),
      messageCount: Number(row.messageCount) || 1,
      unread: row.unread === true,
      hasAttachments: row.hasAttachments === true,
    };
  });
  return { threads, page, hasMore: data.hasMore === true };
}

export async function getInboxThread(id: string) {
  if (!GMAIL_ID.test(id)) throw new MailInboxError("Identificador de correo inválido.", 400);
  const data = await callRelay<{ thread?: { id?: unknown; subject?: unknown; messages?: unknown[] } }>("get", { id });
  const thread = data.thread ?? {};
  const messages: InboxMessage[] = (Array.isArray(thread.messages) ? thread.messages : []).map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: text(row.id),
      from: text(row.from),
      to: text(row.to),
      cc: text(row.cc),
      date: text(row.date),
      subject: text(row.subject),
      body: text(row.body),
      attachments: (Array.isArray(row.attachments) ? row.attachments : []).map((attachment) => {
        const a = attachment as Record<string, unknown>;
        return { index: Number(a.index) || 0, name: text(a.name) || "adjunto", contentType: text(a.contentType), size: Number(a.size) || 0 };
      }),
    };
  });
  return { id: text(thread.id) || id, subject: text(thread.subject), messages };
}

export async function getInboxAttachment(messageId: string, index: number) {
  if (!GMAIL_ID.test(messageId)) throw new MailInboxError("Identificador de correo inválido.", 400);
  if (!Number.isInteger(index) || index < 0 || index > 200) throw new MailInboxError("Adjunto inválido.", 400);
  const data = await callRelay<{ name?: unknown; contentType?: unknown; data?: unknown }>("attachment", { messageId, index });
  return {
    name: text(data.name) || "adjunto",
    contentType: text(data.contentType) || "application/octet-stream",
    bytes: Buffer.from(text(data.data), "base64"),
  };
}

// Nombre de archivo seguro para el encabezado Content-Disposition.
export function attachmentDisposition(name: string) {
  const ascii = name.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "").trim() || "adjunto";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
