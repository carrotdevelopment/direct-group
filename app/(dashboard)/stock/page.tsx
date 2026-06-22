import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, CircleAlert, Warehouse } from "lucide-react";
import { DataList, type DataRow } from "@/components/domain/data-list";
import { PageHeader } from "@/components/domain/page-header";
import { SummaryStrip } from "@/components/domain/summary-strip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const rows: DataRow[] = [
  { id: "1", primary: "Aceite de girasol 1,5 L", secondary: "DG-002841", values: ["Supermercados Norte", "Depósito central", "2.480", <Badge key="res" tone="neutral">480 reservadas</Badge>, "2.000"], status: { label: "Disponible", tone: "success" } },
  { id: "2", primary: "Yerba mate tradicional 1 kg", secondary: "DG-001772", values: ["Mercado del Centro", "Depósito central", "184", <Badge key="res" tone="neutral">120 reservadas</Badge>, "64"], status: { label: "Crítico", tone: "warning" } },
  { id: "3", primary: "Harina de trigo 000 1 kg", secondary: "DG-003091", values: ["Distribuidora Sur", "Depósito Posadas", "4.108", <Badge key="res" tone="neutral">350 reservadas</Badge>, "3.758"], status: { label: "Disponible", tone: "success" } },
  { id: "4", primary: "Azúcar refinada 1 kg", secondary: "DG-000648", values: ["Hiper Mayorista", "Depósito central", "0", <Badge key="res" tone="neutral">0 reservadas</Badge>, "0"], status: { label: "Sin stock", tone: "danger" } },
  { id: "5", primary: "Arroz largo fino 1 kg", secondary: "DG-004220", values: ["Supermercados Norte", "Depósito central", "886", <Badge key="res" tone="neutral">0 reservadas</Badge>, "886"], status: { label: "Disponible", tone: "success" } },
];

export const metadata = { title: "Stock" };
export default function StockPage() {
  return <><PageHeader eyebrow="Stock" title="Inventario y movimientos" description="Vista reconstruible desde el ledger: cada unidad tiene origen, destino, referencia y responsable." action="Nuevo movimiento" secondaryAction={<Button variant="secondary"><ArrowLeftRight size={15} /> Transferir</Button>} /><SummaryStrip items={[{ label: "Stock total", value: "48.284 u.", meta: "$ 184,6 M valorizado", icon: Warehouse }, { label: "Ingresos del mes", value: "18.420", meta: "162 movimientos", icon: ArrowDownToLine, tone: "blue" }, { label: "Egresos del mes", value: "16.884", meta: "684 ventas", icon: ArrowUpFromLine, tone: "orange" }, { label: "Stock crítico", value: "17", meta: "5 sin existencia", icon: CircleAlert, tone: "red" }]} /><DataList columns={["Producto", "Cliente", "Depósito", "Stock físico", "Comprometido", "Disponible"]} rows={rows} searchPlaceholder="Buscar producto, cliente o depósito..." /></>;
}
