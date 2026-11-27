import { sendSmtpMail } from "@/lib/smtp-mailer";
import { readSetting } from "@/lib/system-health";
import { buildTangoLoadReport, canVerifyInTango, loadedInTango } from "@/lib/tango-load-report";
import { readLastTangoLoadReport, readTangoLoadItems, readTangoReturnedRows, writeLastTangoLoadReport } from "@/lib/tango-load-report-db";

// Uso (en el servidor, todos los días desde cron a la mañana):
//   set -a && . ./.env && set +a && DG_DATA_SOURCE=postgresql npx tsx --conditions=react-server scripts/tango-load-report.ts
// Con --dry-run muestra el correo sin mandarlo ni marcar el período como reportado.
// Manda a los destinatarios de Sistema > Configuración > Notificaciones > Reporte diario de carga en Tango lo que se
// cargó en la plataforma desde el reporte anterior (la primera vez, desde ayer) hasta la medianoche de hoy.
const dryRun = process.argv.includes("--dry-run");
// Hasta cuántos días para atrás se sigue avisando lo que no volvió desde Tango.
const LOOKBACK_DAYS = 60;

const argentinaDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(date);
const startOfArgentinaDay = (isoDay: string) => new Date(`${isoDay}T00:00:00-03:00`);

async function main() {
  const now = new Date();
  const to = startOfArgentinaDay(argentinaDay(now));
  const from = (await readLastTangoLoadReport()) ?? new Date(to.getTime() - 24 * 3_600_000);
  const stamp = now.toISOString();
  if (from >= to) return console.log(`${stamp} Ya se reportó hasta ${to.toISOString()}.`);

  // Lo nuevo del período y lo de los dos meses anteriores que se puede corroborar; lo que ya volvió desde Tango
  // no se manda.
  const items = await readTangoLoadItems(from, to);
  const earlier = (await readTangoLoadItems(new Date(from.getTime() - LOOKBACK_DAYS * 86_400_000), from)).filter(canVerifyInTango);
  const loaded = loadedInTango([...earlier, ...items], await readTangoReturnedRows(new Date(from.getTime() - (LOOKBACK_DAYS + 7) * 86_400_000)));
  const report = buildTangoLoadReport(
    items.filter((item) => !loaded.has(item.id)),
    { from, to: new Date(to.getTime() - 1) },
    earlier.filter((item) => !loaded.has(item.id)),
  );
  if (dryRun) {
    console.log(report ? `${report.subject}\n\n${report.text}` : `${stamp} Nada para cargar en Tango entre ${from.toISOString()} y ${to.toISOString()}.`);
    return;
  }
  const { value: settings } = await readSetting("notificaciones");
  const recipients = settings.tangoReportRecipients ?? [];
  // Sin destinatarios no se marca como reportado: cuando se agregue alguien, arranca desde ayer.
  if (recipients.length === 0) return console.log(`${stamp} Sin destinatarios para el reporte de carga en Tango: no se mandó.`);
  if (!report) {
    await writeLastTangoLoadReport(to);
    return console.log(`${stamp} Nada para cargar en Tango: no se mandó correo.`);
  }
  for (const address of recipients) await sendSmtpMail({ to: address, subject: report.subject, text: report.text });
  await writeLastTangoLoadReport(to);
  console.log(`${stamp} ${report.subject}. Enviado a ${recipients.join(", ")}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`${new Date().toISOString()} ERROR`, error instanceof Error ? error.message : error);
    process.exit(1);
  });
