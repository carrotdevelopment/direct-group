import { BadgeDollarSign, Building2, Link2, Users } from "lucide-react";
import { DataList } from "@/components/domain/data-list";
import { PageHeader } from "@/components/domain/page-header";
import { SummaryStrip } from "@/components/domain/summary-strip";
import { clientRows } from "@/lib/demo-data";

export const metadata = { title: "Clientes" };
export default function ClientesPage() {
  return <><PageHeader eyebrow="Clientes" title="Clientes y cuentas" description="Centralizá acuerdos comerciales, códigos propios, precios y trazabilidad por cliente." action="Nuevo cliente" /><SummaryStrip items={[{ label: "Clientes activos", value: "17", meta: "Cartera inicial cargada", icon: Users }, { label: "Códigos vinculados", value: "0", meta: "Pendientes de asignar", icon: Link2, tone: "blue" }, { label: "Stock asignado", value: "—", meta: "Pendiente de consolidar", icon: Building2, tone: "orange" }, { label: "Facturación mensual", value: "—", meta: "Pendiente de consolidar", icon: BadgeDollarSign }]} /><DataList columns={["Cliente", "Segmento", "Catálogo", "Equivalencias", "Stock valorizado", "Última operación"]} rows={clientRows} searchPlaceholder="Buscar por nombre o código de cliente..." /></>;
}
