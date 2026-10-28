import { sendSmtpMail } from "@/lib/smtp-mailer";
import { backupHealth, readSetting, tangoHealth, urbanoHealth } from "@/lib/system-health";

// Uso (en el servidor, todos los días desde cron, después de la carga de Urbano y del respaldo):
//   set -a && . ./.env && set +a && DG_DATA_SOURCE=postgresql npx tsx --conditions=react-server scripts/check-alerts.ts
// Revisa la carga de stock de Urbano, el conector de Tango y los respaldos según Sistema > Configuración >
// Notificaciones, y si algo falla manda un correo a los destinatarios configurados.
async function main() {
  const { value: settings } = await readSetting("notificaciones");
  const checks = [
    settings.urbano ? { name: "Stock de Urbano", check: await urbanoHealth() } : null,
    settings.tango ? { name: "Conector de Tango", check: await tangoHealth(settings.tangoIdleBusinessDays) } : null,
    settings.backups ? { name: "Respaldos de la base", check: backupHealth() } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  const failing = checks.filter((item) => !item.check.ok);
  const stamp = new Date().toISOString();
  if (failing.length === 0) return console.log(`${stamp} OK. Sin problemas (${checks.map((item) => item.name).join(", ") || "nada para revisar"}).`);
  console.log(`${stamp} Problemas: ${failing.map((item) => `${item.name}: ${item.check.summary}`).join(" | ")}`);
  if (settings.recipients.length === 0) return console.log("No hay destinatarios configurados: no se mandó correo.");
  const text = [
    "La revisión diaria de la plataforma encontró problemas:",
    "",
    ...failing.flatMap((item) => [`• ${item.name}: ${item.check.summary}`, ...item.check.details.map((detail) => `  ${detail}`)]),
    "",
    "Se puede revisar en Sistema > Configuración de la plataforma.",
  ].join("\n");
  for (const to of settings.recipients) {
    await sendSmtpMail({ to, subject: `Aviso de la plataforma: ${failing.map((item) => item.name).join(", ")}`, text });
  }
  console.log(`Correo enviado a ${settings.recipients.join(", ")}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`${new Date().toISOString()} ERROR`, error instanceof Error ? error.message : error);
    process.exit(1);
  });
