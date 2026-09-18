import { requirePageModule } from "@/server/lib/access";
import { CircleAlert, PlugZap, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";
import { SummaryStrip } from "@/components/domain/summary-strip";
import { lastCompletedSync, syncStatus } from "@/lib/tango-sync";

export const metadata = { title: "Compras" };

const ACTIVE_STATUSES = new Set(["pending", "running"]);
const CONNECTOR_STALE_HOURS = 30;
const SYNC_STALE_HOURS = 48;

function formatDateTime(value: Date | null) {
  if (!value) return "Sin datos";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(value);
}

function hoursSince(value: Date) {
  return (Date.now() - value.getTime()) / (1000 * 60 * 60);
}

export default async function ComprasPage() {
  await requirePageModule("compras");
  const [status, completed] = await Promise.all([syncStatus(), lastCompletedSync()]);

  const connectorTile = (() => {
    if (status.job && ACTIVE_STATUSES.has(status.job.status)) {
      return {
        label: "Estado del conector",
        value: "Sincronizando",
        meta: status.job.status === "running"
          ? `${status.job.rowCount} filas recibidas hasta ahora`
          : "En cola, todavía no arrancó",
        icon: RefreshCw,
        tone: "blue" as const,
      };
    }
    if (!status.lastSeenAt) {
      return {
        label: "Estado del conector",
        value: "Nunca se conectó",
        meta: "El agente de la PC de la oficina todavía no contactó al servidor",
        icon: PlugZap,
        tone: "red" as const,
      };
    }
    const stale = hoursSince(status.lastSeenAt) > CONNECTOR_STALE_HOURS;
    return {
      label: "Estado del conector",
      value: stale ? "Sin conexión" : "Conectado",
      meta: `Último contacto: ${formatDateTime(status.lastSeenAt)}`,
      icon: PlugZap,
      tone: stale ? ("red" as const) : ("green" as const),
    };
  })();

  const syncTile = (() => {
    if (!completed || !completed.finishedAt) {
      return {
        label: "Última sincronización",
        value: "Sin datos",
        meta: "Todavía no se importó nada de Tango",
        icon: RefreshCw,
        tone: "red" as const,
        href: "/ingresos",
      };
    }
    const stale = hoursSince(completed.finishedAt) > SYNC_STALE_HOURS;
    return {
      label: "Última sincronización",
      value: formatDateTime(completed.finishedAt),
      meta: `${completed.rowCount} registros · ${completed.from} a ${completed.to}`,
      icon: RefreshCw,
      tone: stale ? ("orange" as const) : ("green" as const),
      href: "/ingresos",
    };
  })();

  const items = [connectorTile, syncTile];
  if (status.job?.status === "failed") {
    items.push({
      label: "Último intento falló",
      value: "Con errores",
      meta: status.job.message || "El conector no pudo completar la importación",
      icon: CircleAlert,
      tone: "red" as const,
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Compras"
        title="Sincronización con Tango"
        description="Estado real del conector que trae los ingresos de mercadería desde Tango. El detalle de cada movimiento se ve en Ingresos."
      />
      <SummaryStrip items={items} />
      <section className="card animate-enter p-6 text-sm leading-6 text-[#62728a]">
        Todavía no hay un módulo de Compras con datos propios: los ingresos de mercadería que trae Tango se
        cargan directamente en{" "}
        <a href="/ingresos" className="font-bold text-[#0b5bbb] hover:underline">
          Ingresos
        </a>
        . Esta pantalla por ahora solo informa si la sincronización automática con Tango está al día.
      </section>
    </>
  );
}
