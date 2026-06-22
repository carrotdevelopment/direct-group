import { CircleDollarSign, FileCheck2, PackageSearch, Truck } from "lucide-react";
import { DataList } from "@/components/domain/data-list";
import { PageHeader } from "@/components/domain/page-header";
import { SummaryStrip } from "@/components/domain/summary-strip";
import { providerRows } from "@/lib/demo-data";

export const metadata = { title: "Proveedores" };
export default function ProveedoresPage() {
  return <><PageHeader eyebrow="Proveedores" title="Red de proveedores" description="Gestioná proveedores, catálogos, documentos y vigencia de costos desde un único lugar." action="Nuevo proveedor" /><SummaryStrip items={[{ label: "Proveedores activos", value: "16", meta: "4 con actividad hoy", icon: Truck }, { label: "Productos abastecidos", value: "1.104", meta: "88% del catálogo", icon: PackageSearch, tone: "blue" }, { label: "Listas vigentes", value: "13", meta: "3 por actualizar", icon: FileCheck2 }, { label: "Costo mensual", value: "$ 31,4 M", meta: "+4,1% intermensual", icon: CircleDollarSign, tone: "orange" }]} /><DataList columns={["Proveedor", "Catálogo", "Moneda", "Última lista", "Vigencia", "Documentos"]} rows={providerRows} searchPlaceholder="Buscar proveedor por nombre o CUIT..." /></>;
}
