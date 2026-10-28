import "server-only";
import fs from "node:fs";
import path from "node:path";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { businessDaysBetween, withDefaults, type SettingKey } from "@/lib/org-settings";

// Configuración guardada (Sistema > Configuración) y estado de las integraciones y respaldos, que usan
// la pantalla de Configuración y el control diario de avisos (scripts/check-alerts.ts).

export async function readSetting<K extends SettingKey>(key: K) {
  const row = await excelPostgres.configSetting.findUnique({ where: { key } });
  return { value: withDefaults(key, row?.value), updatedBy: row?.updatedBy ?? null, updatedAt: row?.updatedAt.toISOString() ?? null };
}

export async function writeSetting(key: SettingKey, value: object, actor: string) {
  await excelPostgres.configSetting.upsert({
    where: { key },
    create: { key, value, updatedBy: actor },
    update: { value, updatedBy: actor },
  });
}

export type HealthCheck = { ok: boolean; summary: string; details: string[] };

const TIME_ZONE = "America/Argentina/Buenos_Aires";
const argentinaDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
const argentinaHour = (date: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(date));
export const displayDateTime = (date: Date) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
const display = displayDateTime;
const displayDay = (iso: string) => iso.split("-").reverse().join("/");
const hoursSince = (date: Date, now: Date) => (now.getTime() - date.getTime()) / 3_600_000;

// Stock de Urbano: la carga automática corre a las 7:00 (hora Argentina) y tiene que haber una carga de hoy.
export async function urbanoHealth(now = new Date()): Promise<HealthCheck> {
  const last = await excelPostgres.urbanoStockLoad.findFirst({ orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }] });
  if (!last) return { ok: false, summary: "Todavía no hay ninguna carga del stock de Urbano.", details: [] };
  const lastDay = last.reportDate.toISOString().slice(0, 10);
  const today = argentinaDay(now);
  const yesterday = argentinaDay(new Date(now.getTime() - 86_400_000));
  const ok = lastDay === today || (lastDay === yesterday && argentinaHour(now) < 8);
  return {
    ok,
    summary: ok
      ? `Última carga: reporte del ${displayDay(lastDay)} (${last.source === "portal" ? "automática" : "Excel"}), ${last.rowCount} códigos.`
      : `No se trajo el stock de Urbano de hoy. La última carga es del ${displayDay(lastDay)}.`,
    details: [`Cargada por ${last.createdBy} el ${display(last.createdAt)}.`],
  };
}

// Conector de Tango: se conecta todos los días a las 6:00 y trae los ingresos del día anterior.
export async function tangoHealth(idleBusinessDays: number, now = new Date()): Promise<HealthCheck> {
  const [state, lastJob, lastIncome] = await Promise.all([
    excelPostgres.tangoConnectorState.findFirst({ orderBy: { lastSeenAt: "desc" } }),
    excelPostgres.tangoSyncJob.findFirst({ where: { status: { in: ["completed", "failed"] } }, orderBy: { createdAt: "desc" } }),
    excelPostgres.tangoIncome.findFirst({ where: { createdBy: null }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const problems: string[] = [];
  const details: string[] = [];
  if (!state) problems.push("El conector de Tango nunca se conectó.");
  else {
    details.push(`Última conexión: ${display(state.lastSeenAt)}.`);
    if (hoursSince(state.lastSeenAt, now) > 26) problems.push(`El conector de Tango no se conecta desde el ${display(state.lastSeenAt)}.`);
  }
  if (lastJob) {
    details.push(`Última consulta: ${display(lastJob.createdAt)}, ${lastJob.rowCount} ingresos${lastJob.status === "failed" ? " (con error)" : ""}.`);
    if (lastJob.status === "failed") problems.push(`La última consulta a Tango terminó con error${lastJob.message ? `: ${lastJob.message}` : "."}`);
  }
  if (lastIncome) {
    const idle = businessDaysBetween(lastIncome.createdAt, now);
    details.push(`Último ingreso nuevo desde Tango: ${display(lastIncome.createdAt)}.`);
    if (idleBusinessDays > 0 && idle >= idleBusinessDays) problems.push(`Hace ${idle} días hábiles que no entran ingresos nuevos desde Tango.`);
  }
  return { ok: problems.length === 0, summary: problems.length ? problems.join(" ") : "El conector de Tango funciona normalmente.", details };
}

export type BackupFile = { name: string; sizeBytes: number; modifiedAt: string; automatic: boolean };

// Respaldos de la base en el servidor (carpeta BACKUP_DIR, por defecto /root/backups; los automáticos en "auto").
export function listBackups(): { folder: string; available: boolean; files: BackupFile[] } {
  const folder = process.env.BACKUP_DIR || "/root/backups";
  const files: BackupFile[] = [];
  const read = (dir: string, automatic: boolean) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".dump")) continue;
      const stat = fs.statSync(path.join(dir, entry.name));
      files.push({ name: entry.name, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString(), automatic });
    }
  };
  try {
    read(folder, false);
    if (fs.existsSync(path.join(folder, "auto"))) read(path.join(folder, "auto"), true);
  } catch {
    return { folder, available: false, files: [] };
  }
  files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return { folder, available: true, files };
}

export function backupHealth(now = new Date()): HealthCheck {
  const { available, files } = listBackups();
  if (!available) return { ok: false, summary: "No se puede leer la carpeta de respaldos.", details: [] };
  const lastAuto = files.find((file) => file.automatic);
  if (!lastAuto) return { ok: false, summary: "Todavía no hay respaldos automáticos de la base.", details: [] };
  const date = new Date(lastAuto.modifiedAt);
  const ok = hoursSince(date, now) <= 26;
  return {
    ok,
    summary: ok ? `Último respaldo automático: ${display(date)}.` : `El último respaldo automático es del ${display(date)}: no se hizo el de hoy.`,
    details: [`${lastAuto.name} (${(lastAuto.sizeBytes / 1_048_576).toFixed(1)} MB).`],
  };
}

// Usuarios que no ingresan hace más de `days` días (o nunca ingresaron).
export function withoutRecentLogin<T extends { lastLoginAt: Date | null }>(users: T[], days: number, now = new Date()) {
  const limit = now.getTime() - days * 86_400_000;
  return users.filter((user) => !user.lastLoginAt || user.lastLoginAt.getTime() < limit);
}
