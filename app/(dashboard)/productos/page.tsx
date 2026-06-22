import { Boxes, CircleAlert, Layers3, PackageCheck } from "lucide-react";
import { DataList } from "@/components/domain/data-list";
import { PageHeader } from "@/components/domain/page-header";
import { SummaryStrip } from "@/components/domain/summary-strip";
import { productRows } from "@/lib/demo-data";

export const metadata = { title: "Productos" };

export default function ProductosPage() {
  return <><PageHeader eyebrow="Productos" title="Catálogo de productos" description="Administrá el maestro único, sus equivalencias externas y la disponibilidad comercial." action="Nuevo producto" /><SummaryStrip items={[{ label: "Productos activos", value: "1.248", meta: "+32 este mes", icon: PackageCheck }, { label: "Categorías", value: "18", meta: "Catálogo organizado", icon: Layers3, tone: "blue" }, { label: "Stock bajo", value: "12", meta: "Requieren reposición", icon: CircleAlert, tone: "orange" }, { label: "Sin equivalencia", value: "7", meta: "Pendientes de mapear", icon: Boxes, tone: "red" }]} /><DataList columns={["Producto", "Marca", "Proveedor", "Categoría", "Bulto", "Stock"]} rows={productRows} searchPlaceholder="Buscar por código, producto o marca..." /></>;
}
