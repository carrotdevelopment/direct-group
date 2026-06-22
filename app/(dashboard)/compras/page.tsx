import { CircleAlert, PackageCheck, RefreshCw, ShoppingCart } from "lucide-react";
import { DataList } from "@/components/domain/data-list";
import { PageHeader } from "@/components/domain/page-header";
import { SummaryStrip } from "@/components/domain/summary-strip";
import { purchaseRows } from "@/lib/demo-data";

export const metadata = { title: "Compras" };
export default function ComprasPage() {
  return <><PageHeader eyebrow="Compras" title="Compras e ingresos" description="Importá desde Tango, revisá el matching y controlá cada recepción antes de impactar en stock." action="Nueva compra" /><SummaryStrip items={[{ label: "Compras del mes", value: "$ 31,4 M", meta: "+4,1% intermensual", icon: ShoppingCart }, { label: "Unidades recibidas", value: "18.420", meta: "82% del plan", icon: PackageCheck, tone: "blue" }, { label: "Sync Tango", value: "Hace 12 min", meta: "246 registros", icon: RefreshCw, tone: "orange" }, { label: "Con diferencias", value: "4", meta: "Requieren revisión", icon: CircleAlert, tone: "red" }]} /><DataList columns={["Compra", "Fecha", "Orden", "Detalle", "Cantidad", "Importe"]} rows={purchaseRows} searchPlaceholder="Buscar compra, OC o referencia Tango..." /></>;
}
