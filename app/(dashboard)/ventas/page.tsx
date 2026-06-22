import { CircleAlert, CircleDollarSign, FileSpreadsheet, HandCoins } from "lucide-react";
import { DataList } from "@/components/domain/data-list";
import { PageHeader } from "@/components/domain/page-header";
import { SummaryStrip } from "@/components/domain/summary-strip";
import { salesRows } from "@/lib/demo-data";

export const metadata = { title: "Ventas" };
export default function VentasPage() {
  return <><PageHeader eyebrow="Ventas" title="Ventas" description="Seguimiento de operaciones confirmadas, cargas masivas y su impacto trazable sobre el stock." action="Nueva venta" /><SummaryStrip items={[{ label: "Ventas del mes", value: "$ 42,8 M", meta: "+12,4% intermensual", icon: CircleDollarSign }, { label: "Operaciones", value: "684", meta: "31 procesadas hoy", icon: HandCoins, tone: "blue" }, { label: "Desde Excel", value: "89%", meta: "Carga automatizada", icon: FileSpreadsheet, tone: "orange" }, { label: "Con observaciones", value: "7", meta: "Requieren revisión", icon: CircleAlert, tone: "red" }]} /><DataList columns={["Operación", "Fecha", "Detalle", "Cantidad", "Importe", "Origen"]} rows={salesRows} searchPlaceholder="Buscar venta, OC o cliente..." /></>;
}
