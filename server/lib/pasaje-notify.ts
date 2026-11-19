import "server-only";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { sendSmtpMail } from "@/lib/smtp-mailer";
import { pasajeMailRecipients, pasajeMailText, type PasajeMailKind } from "@/lib/pasaje-notify-text";
import { prisma } from "@/server/lib/prisma";

// Correos de pasajes a las encargadas de cada cliente (las personas con ese cliente asignado en Permisos):
//  - "aprobar": al cargarse un pasaje, a la encargada del cliente origen, para que lo apruebe.
//  - "recibir": al aprobarlo el origen, a la encargada del cliente destino, para que confirme lo que llega.
// Cada persona recibe un solo correo con todos sus pasajes de esa carga. Quien hizo la acción no se avisa a sí
// misma. Un correo que falla no frena el pasaje: queda en el log.
// Fuera de producción no se manda nada (la copia local tiene los correos reales de las chicas): solo se
// muestra en la consola.
export async function notifyPasajes(kind: PasajeMailKind, ids: string[], actorName: string) {
  try {
    if (ids.length === 0) return;
    const [pasajes, users] = await Promise.all([
      excelPostgres.pasajeRequest.findMany({ where: { id: { in: ids } }, orderBy: [{ sourceRow: "asc" }, { createdAt: "asc" }] }),
      prisma.user.findMany({ where: { active: true }, select: { name: true, email: true, role: true, moduleAccess: true, pasajeClients: true } }),
    ]);
    const link = `${(process.env.AUTH_URL || process.env.NEXTAUTH_URL || "").replace(/\/+$/, "")}/pasajes`;
    for (const { user, pasajes: own } of pasajeMailRecipients(kind, pasajes, users, actorName)) {
      const mail = { to: user.email, ...pasajeMailText(kind, own, user.name, actorName, link) };
      if (process.env.NODE_ENV !== "production") {
        console.log(`[pasajes] (no se envía fuera de producción) Para ${mail.to}: ${mail.subject}\n${mail.text}`);
        continue;
      }
      await sendSmtpMail(mail).catch((error) =>
        console.error(`[pasajes] No se pudo mandar el aviso a ${mail.to}:`, error instanceof Error ? error.message : error));
    }
  } catch (error) {
    console.error("[pasajes] No se pudieron armar los avisos:", error instanceof Error ? error.message : error);
  }
}
