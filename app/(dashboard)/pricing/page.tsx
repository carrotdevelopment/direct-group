import { BadgePercent, CircleDollarSign, Clock3, TrendingUp } from "lucide-react";
import { DataList } from "@/components/domain/data-list";
import { PageHeader } from "@/components/domain/page-header";
import { SummaryStrip } from "@/components/domain/summary-strip";
import { pricingRows } from "@/lib/demo-data";

export const metadata = { title: "Pricing" };
export default function PricingPage() {
  return <><PageHeader eyebrow="Pricing" title="Pricing por cliente" description="Controlá costos, componentes impositivos, vigencias y rentabilidad por combinación cliente-producto." action="Nuevo pricing" /><SummaryStrip items={[{ label: "Precios vigentes", value: "2.841", meta: "96,4% del catálogo", icon: CircleDollarSign }, { label: "Margen promedio", value: "26,8%", meta: "+1,2 pp este mes", icon: TrendingUp, tone: "blue" }, { label: "Por vencer", value: "32", meta: "Próximos 7 días", icon: Clock3, tone: "orange" }, { label: "Bajo margen", value: "14", meta: "Menor al objetivo", icon: BadgePercent, tone: "red" }]} /><DataList columns={["Producto / cliente", "Costo DG", "IVA", "Mark up", "PVC con IVA", "Utilidad"]} rows={pricingRows} searchPlaceholder="Buscar producto, cliente o código..." /></>;
}
