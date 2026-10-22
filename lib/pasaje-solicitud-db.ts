import "server-only";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { prisma } from "@/server/lib/prisma";
import { sendSmtpMail } from "@/lib/smtp-mailer";
import { PasajeAjusteError } from "@/lib/pasajes-ajustes-db";
import type { PasajeActor } from "@/lib/module-access";
import { resolveSolicitud, type ResolvedRow, type SolicitudRow } from "@/lib/pasaje-solicitud";

const MAX_ROWS = 300;
const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();
const text = (value: unknown, max = 255) => String(value ?? "").trim().slice(0, max);

function sanitizeRows(input: unknown): SolicitudRow[] {
  if (!Array.isArray(input) || input.length === 0) throw new PasajeAjusteError("La solicitud no tiene filas para cargar.");
  if (input.length > MAX_ROWS) throw new PasajeAjusteError(`Se pueden cargar hasta ${MAX_ROWS} pasajes por solicitud.`);
  const quantity = (value: unknown) => (value === null || value === "" || value === undefined ? null : Number(value));
  return input.map((item, index) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const date = text(row.requestDate, 10);
    return {
      row: Number(row.row) || index + 1,
      requestDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      fromShipper: text(row.fromShipper, 20),
      fromClientCode: text(row.fromClientCode),
      fromDescription: text(row.fromDescription),
      fromQuantity: quantity(row.fromQuantity),
      toShipper: text(row.toShipper, 20),
      toClientCode: text(row.toClientCode),
      toDescription: text(row.toDescription),
      toQuantity: quantity(row.toQuantity),
    };
  });
}

async function references() {
  const [codes, shippers] = await Promise.all([
    excelPostgres.excelClientCode.findMany({ select: { client: true, clientCode: true, uniqueCode: true, active: true, voidedAt: true } }),
    excelPostgres.urbanoShipper.findMany(),
  ]);
  return {
    codes: codes
      .filter((code) => code.client && code.clientCode && code.uniqueCode)
      .map((code) => ({
        client: String(code.client), clientCode: String(code.clientCode), uniqueCode: String(code.uniqueCode),
        active: code.active === true, voided: !!code.voidedAt,
      })),
    shippers: shippers.map((shipper) => ({ code: shipper.code, name: shipper.name, clients: shipper.clients, active: shipper.active })),
  };
}

export async function previewSolicitud(input: unknown): Promise<ResolvedRow[]> {
  const rows = sanitizeRows(input);
  const { codes, shippers } = await references();
  return resolveSolicitud(rows, codes, shippers);
}

export function listUrbanoShippers() {
  return excelPostgres.urbanoShipper.findMany({ orderBy: { code: "asc" } });
}

type NotificationResult = { sent: { to: string; pasajes: number }[]; failed: { to: string; error: string }[]; withoutRecipient: string[] };

function formatDate(iso: string | null) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

// Avisa por correo a cada representante del cliente destino (usuarios con el módulo Pasajes y ese
// cliente asignado) que tiene pasajes para aprobar. Si un cliente no tiene representantes, avisa a
// los administradores. Quien cargó la solicitud no recibe aviso: no puede aprobar sus propios pasajes.
async function notifyRepresentatives(
  pasajes: { toClient: string; fromClient: string; fromClientCode: string; toClientCode: string; product: string | null; uniqueCode: string; quantity: number }[],
  actor: PasajeActor,
  requestDate: string | null,
): Promise<NotificationResult> {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { name: true, email: true, role: true, moduleAccess: true, pasajeClients: true },
  });
  const others = users.filter((user) => normalize(user.name) !== normalize(actor.name) && normalize(user.email) !== normalize(actor.name));
  const admins = others.filter((user) => user.role === "ADMIN");
  const byRecipient = new Map<string, { name: string; email: string; items: typeof pasajes }>();
  const withoutRecipient = new Set<string>();

  for (const pasaje of pasajes) {
    const representatives = others.filter((user) =>
      user.role !== "ADMIN" && user.moduleAccess.includes("pasajes") &&
      user.pasajeClients.some((client) => normalize(client) === normalize(pasaje.toClient)));
    const recipients = representatives.length ? representatives : admins;
    if (!recipients.length) withoutRecipient.add(pasaje.toClient);
    for (const user of recipients) {
      const entry = byRecipient.get(user.email) ?? { name: user.name, email: user.email, items: [] };
      entry.items.push(pasaje);
      byRecipient.set(user.email, entry);
    }
  }

  const result: NotificationResult = { sent: [], failed: [], withoutRecipient: [...withoutRecipient] };
  const baseUrl = (process.env.AUTH_URL ?? "").replace(/\/$/, "");
  const dateLabel = formatDate(requestDate);
  for (const { name, email, items } of byRecipient.values()) {
    const lines = items.map((item) =>
      `- ${item.quantity} × ${item.product || item.uniqueCode} · ${item.fromClient} ${item.fromClientCode} → ${item.toClient} ${item.toClientCode}`);
    const body = [
      `Hola ${name.split(" ")[0] || name},`,
      "",
      `${actor.name} cargó la solicitud de pasaje de stock a Urbano${dateLabel ? ` del ${dateLabel}` : ""}. Tenés ${items.length} ${items.length === 1 ? "pasaje" : "pasajes"} para aprobar:`,
      "",
      ...lines,
      "",
      ...(baseUrl ? ["Podés aprobarlos o rechazarlos en Pasajes y Ajustes:", `${baseUrl}/pasajes`] : ["Podés aprobarlos o rechazarlos en Pasajes y Ajustes de la plataforma."]),
      "",
      "Direct Group",
    ].join("\n");
    try {
      await sendSmtpMail({ to: email, subject: `Pasajes de stock para aprobar${dateLabel ? ` · solicitud a Urbano del ${dateLabel}` : ""}`, text: body });
      result.sent.push({ to: email, pasajes: items.length });
    } catch (error) {
      result.failed.push({ to: email, error: error instanceof Error ? error.message : "No se pudo enviar el correo." });
    }
  }
  return result;
}

// Crea el lote con las filas válidas (las que tienen error no se cargan) y avisa a los representantes.
export async function createSolicitud(input: unknown, fileName: unknown, actor: PasajeActor) {
  const resolved = await previewSolicitud(input);
  const valid = resolved.filter((row) => row.status !== "error" && row.fromClient && row.toClient && row.uniqueCode && row.quantity);
  if (valid.length === 0) throw new PasajeAjusteError("Ninguna fila de la solicitud se puede cargar: revisá los errores.");

  const products = await excelPostgres.excelProduct.findMany({
    // Los códigos únicos de Productos se guardan en minúsculas.
    where: { uniqueCode: { in: [...new Set(valid.map((row) => normalize(row.uniqueCode)))] } },
    select: { uniqueCode: true, product: true },
  });
  const productName = new Map(products.map((product) => [normalize(product.uniqueCode), String(product.product ?? "")]));
  const requestDate = valid.find((row) => row.requestDate)?.requestDate ?? null;
  const toDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);

  const data = valid.map((row) => ({
    fromClient: row.fromClient as string,
    fromClientCode: row.fromClientCode,
    toClient: row.toClient as string,
    toClientCode: row.toClientCode,
    uniqueCode: row.uniqueCode as string,
    product: (productName.get(normalize(row.uniqueCode)) || row.fromDescription || row.toDescription || "").slice(0, 255) || null,
    quantity: row.quantity as number,
    createdBy: actor.name,
    requestDate: toDate(row.requestDate),
    fromShipper: row.fromShipper || null,
    toShipper: row.toShipper || null,
    sourceRow: row.row,
    warning: row.status === "warning" ? row.messages.join(" ") : null,
  }));

  const batch = await excelPostgres.$transaction(async (tx) => {
    const created = await tx.pasajeBatch.create({
      data: { fileName: text(fileName) || null, requestDate: toDate(requestDate), createdBy: actor.name },
    });
    await tx.pasajeRequest.createMany({ data: data.map((row) => ({ ...row, batchId: created.id })) });
    return created;
  });

  const notifications = await notifyRepresentatives(data, actor, requestDate);
  return {
    batchId: batch.id,
    created: data.length,
    skipped: resolved.filter((row) => row.status === "error").map((row) => ({ row: row.row, messages: row.messages })),
    notifications,
  };
}
