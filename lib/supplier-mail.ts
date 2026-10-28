import { excelPostgres } from "@/lib/excel-postgres-client-core";
import { sendSmtpMail } from "@/lib/smtp-mailer";
import { listInbox } from "@/lib/mail-inbox";
import { DEFAULT_SUPPLIER_MAIL, renderMailTemplate, withDefaults, type SupplierMailTemplates } from "@/lib/org-settings";

// Sin "server-only": lo usa también el script que dispara la tarea programada.

const TIME_ZONE = "America/Argentina/Buenos_Aires";

export class SupplierMailError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function dateParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function periodOf(now: Date) {
  const { year, month } = dateParts(now);
  return `${year}-${String(month).padStart(2, "0")}`;
}

// Primer día hábil del mes: lunes a viernes, salvo los feriados nacionales de
// fecha fija que caen en día 1 (1 de enero y 1 de mayo).
export function firstBusinessDay(year: number, month: number) {
  for (let day = 1; day <= 7; day += 1) {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const fixedHoliday = day === 1 && (month === 1 || month === 5);
    if (weekday !== 0 && weekday !== 6 && !fixedHoliday) return day;
  }
  return 1;
}

export function isOnOrAfterFirstBusinessDay(now: Date) {
  const { year, month, day } = dateParts(now);
  return day >= firstBusinessDay(year, month);
}

const monthLabelOf = (date: Date) => new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: TIME_ZONE }).format(date);

// Textos de los correos que se configuran en Sistema > Configuración > Correos a proveedores.
export async function supplierMailTemplates(): Promise<SupplierMailTemplates> {
  const row = await excelPostgres.configSetting.findUnique({ where: { key: "correoProveedores" } });
  return withDefaults("correoProveedores", row?.value);
}

function renderMail(subject: string, body: string, contactName: string, supplier: string, month: Date) {
  const values = { contacto: contactName, proveedor: supplier, mes: monthLabelOf(month) };
  return { subject: renderMailTemplate(subject, values).replace(/\s+/g, " ").trim(), text: renderMailTemplate(body, values) };
}

export function buildPriceRequestMail(contactName: string, supplier: string, now = new Date(), templates = DEFAULT_SUPPLIER_MAIL) {
  return renderMail(templates.requestSubject, templates.requestBody, contactName, supplier, now);
}

// Reconsulta: recordatorio del pedido del mes, para el proveedor que todavía no contestó.
export function buildFollowUpMail(contactName: string, supplier: string, requestedAt: Date, templates = DEFAULT_SUPPLIER_MAIL) {
  return renderMail(templates.followUpSubject, templates.followUpBody, contactName, supplier, requestedAt);
}

export function listSupplierMailContacts() {
  return excelPostgres.supplierMailContact.findMany({ orderBy: { supplier: "asc" } });
}

type ContactInput = { supplier: string; contactName: string; email: string; active?: boolean };

function validate(input: ContactInput) {
  const supplier = String(input.supplier ?? "").trim();
  const contactName = String(input.contactName ?? "").trim();
  const email = String(input.email ?? "").trim();
  if (!supplier) throw new SupplierMailError("Elegí el proveedor.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new SupplierMailError("Ingresá un correo válido.");
  if (supplier.length > 255 || contactName.length > 255 || email.length > 255) {
    throw new SupplierMailError("Alguno de los datos es demasiado largo.");
  }
  return { supplier, contactName, email };
}

export function createSupplierMailContact(input: ContactInput) {
  return excelPostgres.supplierMailContact.create({
    data: { ...validate(input), active: input.active ?? true },
  });
}

export async function updateSupplierMailContact(id: string, input: Partial<ContactInput>) {
  const current = await excelPostgres.supplierMailContact.findUnique({ where: { id } });
  if (!current) throw new SupplierMailError("El contacto no existe.", 404);
  const data = validate({
    supplier: input.supplier ?? current.supplier,
    contactName: input.contactName ?? current.contactName,
    email: input.email ?? current.email,
  });
  return excelPostgres.supplierMailContact.update({
    where: { id },
    data: { ...data, ...(typeof input.active === "boolean" ? { active: input.active } : {}) },
  });
}

export async function deleteSupplierMailContact(id: string) {
  await excelPostgres.supplierMailContact.delete({ where: { id } }).catch(() => {
    throw new SupplierMailError("El contacto no existe.", 404);
  });
}

type Trigger = "auto" | "test" | "reconsulta";

export async function sendPriceRequestToContact(id: string, trigger: Trigger, now = new Date()) {
  const contact = await excelPostgres.supplierMailContact.findUnique({ where: { id } });
  if (!contact) throw new SupplierMailError("El contacto no existe.", 404);
  const period = periodOf(now);
  const mail = buildPriceRequestMail(contact.contactName, contact.supplier, now, await supplierMailTemplates());
  try {
    const result = await sendSmtpMail({ to: contact.email, subject: mail.subject, text: mail.text });
    await excelPostgres.$transaction([
      excelPostgres.supplierMailLog.create({ data: { contactId: id, period, status: "sent", trigger } }),
      // Con cada pedido nuevo se vuelve a esperar la respuesta del proveedor.
      excelPostgres.supplierMailContact.update({ where: { id }, data: { lastSentAt: now, repliedAt: null, replyHasAttachment: false, lastFollowUpAt: null } }),
    ]);
    return { from: result.from, email: contact.email };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo enviar el correo.";
    await excelPostgres.supplierMailLog.create({
      data: { contactId: id, period, status: "failed", trigger, error: message.slice(0, 2000) },
    });
    throw new SupplierMailError(message, 502);
  }
}

// Se ejecuta todos los días: envía a cada proveedor activo una sola vez por mes,
// a partir del primer día hábil. Si ese día falló o el servidor estaba caído,
// el día siguiente lo reintenta.
export async function runMonthlyPriceRequests(now = new Date()) {
  if (!isOnOrAfterFirstBusinessDay(now)) return { skipped: "Todavía no es el primer día hábil del mes.", sent: 0, failed: 0 };
  const period = periodOf(now);
  const { year, month } = dateParts(now);
  // Un proveedor agregado después del primer día hábil entra recién el mes siguiente:
  // así cargar un contacto a mitad de mes no dispara un envío inmediato.
  const cutoff = new Date(Date.UTC(year, month - 1, firstBusinessDay(year, month) + 1, 3, 0, 0));
  const contacts = await excelPostgres.supplierMailContact.findMany({
    where: { active: true, createdAt: { lt: cutoff }, logs: { none: { period, status: "sent", trigger: "auto" } } },
    orderBy: { supplier: "asc" },
  });
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const contact of contacts) {
    try {
      await sendPriceRequestToContact(contact.id, "auto", now);
      sent += 1;
    } catch (error) {
      failed += 1;
      errors.push(`${contact.supplier}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { period, pending: contacts.length, sent, failed, errors };
}

export async function sendFollowUpToContact(id: string, now = new Date()) {
  const contact = await excelPostgres.supplierMailContact.findUnique({ where: { id } });
  if (!contact) throw new SupplierMailError("El contacto no existe.", 404);
  if (!contact.lastSentAt) throw new SupplierMailError("A este proveedor todavía no se le mandó el pedido de catálogo.");
  const mail = buildFollowUpMail(contact.contactName, contact.supplier, contact.lastSentAt, await supplierMailTemplates());
  const period = periodOf(contact.lastSentAt);
  try {
    const result = await sendSmtpMail({ to: contact.email, subject: mail.subject, text: mail.text });
    await excelPostgres.$transaction([
      excelPostgres.supplierMailLog.create({ data: { contactId: id, period, status: "sent", trigger: "reconsulta" } }),
      excelPostgres.supplierMailContact.update({ where: { id }, data: { lastFollowUpAt: now } }),
    ]);
    return { from: result.from, email: contact.email };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo enviar el correo.";
    await excelPostgres.supplierMailLog.create({
      data: { contactId: id, period, status: "failed", trigger: "reconsulta", error: message.slice(0, 2000) },
    });
    throw new SupplierMailError(message, 502);
  }
}

// Remitente propio: los hilos donde el último mensaje es nuestro no cuentan como respuesta.
const OWN_DOMAIN = "@directgroup.com.ar";
const gmailDay = (date: Date) => {
  const { year, month, day } = dateParts(new Date(date.getTime() - 86_400_000));
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
};

// Busca en la casilla de proveedores si el contacto contestó el último pedido: un hilo del correo del
// contacto, o con el asunto del pedido, posterior al envío. Gmail filtra por día; la hora se controla acá.
export async function findSupplierReply(
  contact: { email: string; supplier: string; contactName?: string; lastSentAt: Date },
  templates = DEFAULT_SUPPLIER_MAIL,
) {
  const email = contact.email.trim().toLowerCase().replace(/[^a-z0-9@._+-]/g, "");
  const sentSubject = buildPriceRequestMail(contact.contactName ?? "", contact.supplier, contact.lastSentAt, templates).subject;
  const subject = sentSubject.replace(/^(re|rv|fw|fwd):\s*/i, "").replace(/"/g, "").slice(0, 120);
  const { threads } = await listInbox({ query: `{from:${email} subject:"${subject}"} after:${gmailDay(contact.lastSentAt)}` });
  const replies = threads.filter((thread) => {
    if (new Date(thread.date).getTime() < contact.lastSentAt.getTime()) return false;
    return !thread.from.toLowerCase().includes(OWN_DOMAIN) || thread.messageCount > 1;
  });
  if (replies.length === 0) return null;
  const first = replies.reduce((earliest, thread) => (thread.date < earliest.date ? thread : earliest));
  return { repliedAt: new Date(first.date), hasAttachment: replies.some((thread) => thread.hasAttachments) };
}

// Revisa las respuestas de todos los contactos activos que ya recibieron el pedido. Se corre desde la
// pantalla (botón "Revisar respuestas") y todos los días con el envío mensual.
export async function checkSupplierReplies(now = new Date()) {
  const contacts = await excelPostgres.supplierMailContact.findMany({
    where: { active: true, lastSentAt: { not: null } },
    orderBy: { supplier: "asc" },
  });
  let replied = 0;
  const errors: string[] = [];
  const templates = await supplierMailTemplates();
  const queue = [...contacts];
  // De a pocos a la vez: cada búsqueda pasa por el puente de Google Apps Script.
  const worker = async () => {
    for (let contact = queue.shift(); contact; contact = queue.shift()) {
      if (contact.repliedAt && contact.replyHasAttachment) {
        replied += 1;
        continue;
      }
      try {
        const reply = await findSupplierReply(
          { email: contact.email, supplier: contact.supplier, contactName: contact.contactName, lastSentAt: contact.lastSentAt! },
          templates,
        );
        await excelPostgres.supplierMailContact.update({
          where: { id: contact.id },
          data: { repliesCheckedAt: now, ...(reply ? { repliedAt: reply.repliedAt, replyHasAttachment: reply.hasAttachment } : {}) },
        });
        if (reply) replied += 1;
      } catch (error) {
        errors.push(`${contact.supplier}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return { checked: contacts.length, replied, errors };
}
