import { BadgeDollarSign, Building2, Link2, Users } from "lucide-react";
import { DataList } from "@/components/domain/data-list";
import { PageHeader } from "@/components/domain/page-header";
import { SummaryStrip } from "@/components/domain/summary-strip";
import { clientRows } from "@/lib/demo-data";

export const metadata = { title: "Clientes" };
export default function ClientesPage() {
  return <><PageHeader eyebrow="Clientes" title="Clientes y cuentas" description="Centralizá acuerdos comerciales, códigos propios, pricing y trazabilidad por cliente." action="Nuevo cliente" /><SummaryStrip items={[{ label: "Clientes activos", value: "42", meta: "5 segmentos", icon: Users }, { label: "Códigos vinculados", value: "864", meta: "97,2% con match", icon: Link2, tone: "blue" }, { label: "Stock asignado", value: "$ 184,6 M", meta: "Valorización actual", icon: Building2, tone: "orange" }, { label: "Facturación mensual", value: "$ 42,8 M", meta: "+12,4% intermensual", icon: BadgeDollarSign }]} /><DataList columns={["Cliente", "Segmento", "Catálogo", "Equivalencias", "Stock valorizado", "Última operación"]} rows={clientRows} searchPlaceholder="Buscar por razón social, CUIT o código..." /></>;
}
