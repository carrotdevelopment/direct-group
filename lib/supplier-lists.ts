import { createHash, randomUUID } from "node:crypto";
import { excelPostgres } from "@/lib/excel-postgres-client-core";
import { splitEmails } from "@/lib/email-list";
import { getInboxAttachment, getInboxThread, listInbox, type InboxMessage } from "@/lib/mail-inbox";
import { buildPriceRequestMail, periodOf, supplierMailTemplates } from "@/lib/supplier-mail";
import { supplierPriceFormat } from "@/lib/supplier-price-list";
import type { SupplierMailTemplates } from "@/lib/org-settings";

// Listas de precios que llegan a la casilla de proveedores: quedan pendientes con su vista previa y los
// precios se cargan recién cuando alguien confirma. Sin "server-only": lo usa también la tarea programada.

const OWN_DOMAIN = "directgroup.com.ar";
const MAX_PAGES = 4;
const DAY = 86_400_000;

const isOwn = (from: string) => from.toLowerCase().replace(/[<>\s]+$/, "").endsWith(`@${OWN_DOMAIN}`);
const isExcel = (name: string) => /\.(xlsx|xlsm|xls)$/i.test(name);
const words = (value: string) => ` ${value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

export function mentionsSupplier(value: string, supplier: string) {
  return words(value).includes(words(supplier));
}

type Contact = { supplier: string; contactName: string; email: string; lastSentAt: Date | null };
type Found = { supplier: string; since: Date; period: string; message: InboxMessage; index: number; name: string };

function afterDay(date: Date) {
  // Gmail filtra por día; la hora exacta se controla con la fecha del mensaje.
  return new Date(date.getTime() - DAY).toISOString().slice(0, 10).replace(/-/g, "/");
}

// Desde cuándo se busca y a qué mes corresponde: el del último pedido al proveedor. Sin pedido, el mes en que llega.
function windowFor(contact: Contact, now: Date) {
  const since = contact.lastSentAt ?? new Date(now.getTime() - 35 * DAY);
  return { since, periodFor: (received: Date) => periodOf(contact.lastSentAt ?? received) };
}

async function threadIds(query: string) {
  const ids: string[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await listInbox({ query, page });
    ids.push(...result.threads.filter((thread) => thread.hasAttachments).map((thread) => thread.id));
    if (!result.hasMore) break;
  }
  return ids;
}

export async function findSupplierLists(contacts: Contact[], now: Date, templates: SupplierMailTemplates): Promise<Found[]> {
  const threads = new Map<string, Awaited<ReturnType<typeof getInboxThread>>>();
  const open = async (id: string) => {
    const known = threads.get(id);
    if (known) return known;
    const thread = await getInboxThread(id);
    threads.set(id, thread);
    return thread;
  };
  const found = new Map<string, Found>();
  const collect = (contact: Contact, message: InboxMessage, accept: (name: string) => boolean) => {
    const { since, periodFor } = windowFor(contact, now);
    const received = new Date(message.date);
    if (Number.isNaN(received.getTime()) || received < since) return;
    for (const attachment of message.attachments) {
      if (!isExcel(attachment.name) || !accept(attachment.name)) continue;
      found.set(`${contact.supplier}:${message.id}:${attachment.index}`, {
        supplier: contact.supplier, since, period: periodFor(received), message, index: attachment.index, name: attachment.name,
      });
    }
  };

  for (const contact of contacts) {
    const { since } = windowFor(contact, now);
    const queries = splitEmails(contact.email)
      .map((email) => email.toLowerCase().replace(/[^a-z0-9@._+-]/g, ""))
      .filter(Boolean)
      .map((email) => `from:${email} has:attachment after:${afterDay(since)}`);
    if (contact.lastSentAt) {
      const subject = buildPriceRequestMail(contact.contactName, contact.supplier, contact.lastSentAt, templates).subject.replace(/"/g, "").slice(0, 120);
      queries.push(`subject:"${subject}" has:attachment after:${afterDay(since)}`);
    }
    for (const query of queries) {
      for (const id of await threadIds(query)) {
        for (const message of (await open(id)).messages) {
          if (!isOwn(message.from)) collect(contact, message, () => true);
        }
      }
    }
  }

  // Listas que reenvía alguien de Direct Group: el proveedor se reconoce por el nombre del archivo o el asunto.
  if (contacts.length) {
    const earliest = new Date(Math.min(...contacts.map((contact) => windowFor(contact, now).since.getTime())));
    for (const id of await threadIds(`from:${OWN_DOMAIN} has:attachment after:${afterDay(earliest)}`)) {
      const thread = await open(id);
      for (const message of thread.messages) {
        if (!isOwn(message.from)) continue;
        for (const contact of contacts) collect(contact, message, (name) => mentionsSupplier(name, contact.supplier) || mentionsSupplier(message.subject || thread.subject, contact.supplier));
      }
    }
  }
  return [...found.values()].sort((left, right) => left.message.date.localeCompare(right.message.date));
}

// Busca listas nuevas de los proveedores con formato preparado y las deja pendientes. Cada adjunto se guarda una
// sola vez; si llega de nuevo el mismo archivo para el mismo mes, queda como repetido.
export async function checkSupplierLists(now = new Date()) {
  const all = await excelPostgres.supplierMailContact.findMany({ where: { active: true }, orderBy: { supplier: "asc" } });
  const contacts = all.filter((contact) => supplierPriceFormat(contact.supplier));
  const found = await findSupplierLists(contacts, now, await supplierMailTemplates());
  let created = 0;
  const errors: string[] = [];
  for (const item of found) {
    const where = { messageId: item.message.id, attachmentIndex: item.index, supplier: item.supplier };
    if (await excelPostgres.receivedPriceList.findFirst({ where, select: { id: true } })) continue;
    try {
      const { bytes } = await getInboxAttachment(item.message.id, item.index);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const repeated = await excelPostgres.receivedPriceList.findFirst({ where: { supplier: item.supplier, period: item.period, sha256 }, select: { id: true } });
      const result = await excelPostgres.receivedPriceList.createMany({
        data: [{
          id: randomUUID(), ...where, period: item.period, sha256,
          fileName: item.name.slice(0, 255), sender: item.message.from.slice(0, 255), receivedAt: new Date(item.message.date),
          content: repeated ? null : new Uint8Array(bytes), status: repeated ? "repetida" : "pendiente",
        }],
        skipDuplicates: true,
      });
      if (!repeated) created += result.count;
    } catch (error) {
      errors.push(`${item.supplier} (${item.name}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { suppliers: contacts.length, created, errors };
}

export function pendingPriceLists() {
  return excelPostgres.receivedPriceList.findMany({ where: { status: "pendiente" }, orderBy: [{ supplier: "asc" }, { period: "desc" }, { receivedAt: "asc" }] });
}

export async function resolvePriceLists(ids: string[], status: "cargada" | "descartada", by: string) {
  const result = await excelPostgres.receivedPriceList.updateMany({
    where: { id: { in: ids }, status: "pendiente" },
    data: { status, resolvedBy: by.slice(0, 255), resolvedAt: new Date(), content: null },
  });
  return result.count;
}
