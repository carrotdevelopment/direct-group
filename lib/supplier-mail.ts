import { excelPostgres } from "@/lib/excel-postgres-client-core";
import { sendSmtpMail } from "@/lib/smtp-mailer";

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

export function buildPriceRequestMail(contactName: string, supplier: string, now = new Date()) {
  const monthLabel = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(now);
  const name = contactName.trim();
  const text = [
    name ? `Hola ${name}, buenas tardes.` : "Hola, buenas tardes.",
    "",
    `Solicito el catálogo de productos y la lista de precios actualizada correspondiente a ${monthLabel}.`,
    "",
    "Si es posible, que incluya código de producto, descripción, costo, IVA y precio sugerido de venta.",
    "",
    "Muchas gracias.",
    "",
    "Saludos,",
    "Direct Group",
  ].join("\n");
  return { subject: `Solicitud de catálogo de productos - ${supplier} - ${monthLabel}`, text };
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

type Trigger = "auto" | "test";

export async function sendPriceRequestToContact(id: string, trigger: Trigger, now = new Date()) {
  const contact = await excelPostgres.supplierMailContact.findUnique({ where: { id } });
  if (!contact) throw new SupplierMailError("El contacto no existe.", 404);
  const period = periodOf(now);
  const mail = buildPriceRequestMail(contact.contactName, contact.supplier, now);
  try {
    const result = await sendSmtpMail({ to: contact.email, subject: mail.subject, text: mail.text });
    await excelPostgres.$transaction([
      excelPostgres.supplierMailLog.create({ data: { contactId: id, period, status: "sent", trigger } }),
      excelPostgres.supplierMailContact.update({ where: { id }, data: { lastSentAt: now } }),
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
  const contacts = await excelPostgres.supplierMailContact.findMany({
    where: { active: true, logs: { none: { period, status: "sent", trigger: "auto" } } },
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
