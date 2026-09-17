import { requirePageModule } from "@/server/lib/access";
import { CircleAlert, PackageCheck, RefreshCw, ShoppingCart } from "lucide-react";
import { DataList } from "@/components/domain/data-list";
import { PageHeader } from "@/components/domain/page-header";
import { SummaryStrip } from "@/components/domain/summary-strip";
import { purchaseRows } from "@/lib/demo-data";
import { lastCompletedSync } from "@/lib/tango-sync";

export const metadata = { title: "Compras" };

function formatSyncValue(finishedAt: Date | null) {
  if (!finishedAt) return "Sin sincronizar";
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(finishedAt);
}

export default async function ComprasPage() {
  await requirePageModule("compras");
  const sync = await lastCompletedSync();
  return <><PageHeader eyebrow="Compras" title="Compras e ingresos" description="Importá desde Tango, revisá el matching y controlá cada recepción antes de impactar en stock." action="Nueva compra" /><SummaryStrip items={[{ label: "Compras del mes", value: "$ 31,4 M", meta: "+4,1% intermensual", icon: ShoppingCart }, { label: "Unidades recibidas", value: "18.420", meta: "82% del plan", icon: PackageCheck, tone: "blue" }, { label: "Sync Tango", value: formatSyncValue(sync?.finishedAt ?? null), meta: sync ? `${sync.rowCount} registros (${sync.from} a ${sync.to})` : "Todavía no sincronizó", icon: RefreshCw, tone: "orange" }, { label: "Con diferencias", value: "4", meta: "Requieren revisión", icon: CircleAlert, tone: "red" }]} /><DataList columns={["Compra", "Fecha", "Orden", "Detalle", "Cantidad", "Importe"]} rows={purchaseRows} searchPlaceholder="Buscar compra, OC o referencia Tango..." /></>;
}
