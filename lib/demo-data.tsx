import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import type { DataRow } from "@/components/domain/data-list";

export const productRows: DataRow[] = [
  { id: "1", primary: "Aceite de girasol 1,5 L", secondary: "DG-002841", values: ["Natura", "Molinos Río", "Aceites", "12 u.", <Badge key="stock" tone="success">2.480 u.</Badge>], status: { label: "Activo", tone: "success" } },
  { id: "2", primary: "Yerba mate tradicional 1 kg", secondary: "DG-001772", values: ["Amanda", "La Cachuera", "Infusiones", "10 u.", <Badge key="stock" tone="warning">184 u.</Badge>], status: { label: "Activo", tone: "success" } },
  { id: "3", primary: "Harina de trigo 000 1 kg", secondary: "DG-003091", values: ["Pureza", "Molinos Cañuelas", "Almacén", "10 u.", <Badge key="stock" tone="success">4.108 u.</Badge>], status: { label: "Activo", tone: "success" } },
  { id: "4", primary: "Azúcar refinada 1 kg", secondary: "DG-000648", values: ["Ledesma", "Ledesma SA", "Almacén", "10 u.", <Badge key="stock" tone="danger">0 u.</Badge>], status: { label: "Sin stock", tone: "danger" } },
  { id: "5", primary: "Arroz largo fino 1 kg", secondary: "DG-004220", values: ["Gallo", "Molinos Río", "Almacén", "12 u.", <Badge key="stock" tone="success">886 u.</Badge>], status: { label: "Activo", tone: "success" } },
  { id: "6", primary: "Fideos spaghetti 500 g", secondary: "DG-001105", values: ["Matarazzo", "Molinos Río", "Pastas", "20 u.", <Badge key="stock" tone="warning">96 u.</Badge>], status: { label: "Stock bajo", tone: "warning" } },
];

export const clientRows: DataRow[] = [
  { id: "1", primary: "Supermercados Norte SA", secondary: "CLI-00018 · CUIT 30-71284721-8", values: ["Retail", "48 productos", "24 códigos propios", formatCurrency(12_480_000), "Hace 8 min"], status: { label: "Activo", tone: "success" } },
  { id: "2", primary: "Mercado del Centro SRL", secondary: "CLI-00024 · CUIT 30-69882104-2", values: ["Mayorista", "32 productos", "18 códigos propios", formatCurrency(8_210_400), "Hoy, 09:42"], status: { label: "Activo", tone: "success" } },
  { id: "3", primary: "Distribuidora Sur", secondary: "CLI-00007 · CUIT 30-71455098-0", values: ["Distribuidor", "64 productos", "64 códigos propios", formatCurrency(17_932_100), "Ayer, 18:05"], status: { label: "Activo", tone: "success" } },
  { id: "4", primary: "Hiper Mayorista SA", secondary: "CLI-00031 · CUIT 30-72112991-1", values: ["Mayorista", "29 productos", "12 códigos propios", formatCurrency(6_884_300), "20 jun, 14:22"], status: { label: "Revisión", tone: "warning" } },
  { id: "5", primary: "Autoservicios del Litoral", secondary: "CLI-00042 · CUIT 30-71089233-5", values: ["Retail", "21 productos", "—", formatCurrency(3_208_900), "18 jun, 11:08"], status: { label: "Activo", tone: "success" } },
];

export const providerRows: DataRow[] = [
  { id: "1", primary: "Molinos Río de la Plata", secondary: "PRV-0004 · CUIT 30-50085862-8", values: ["84 productos", "ARS", "Lista junio 2026", "01/06/2026", "2 archivos"], status: { label: "Vigente", tone: "success" } },
  { id: "2", primary: "La Cachuera SA", secondary: "PRV-0011 · CUIT 30-50103687-7", values: ["18 productos", "ARS", "Actualización Q2", "15/05/2026", "1 archivo"], status: { label: "Vigente", tone: "success" } },
  { id: "3", primary: "Ledesma SA", secondary: "PRV-0008 · CUIT 30-50125030-5", values: ["26 productos", "ARS", "Precios mayo", "02/05/2026", "3 archivos"], status: { label: "Por vencer", tone: "warning" } },
  { id: "4", primary: "Molinos Cañuelas", secondary: "PRV-0017 · CUIT 30-70801944-4", values: ["41 productos", "ARS", "Lista general", "01/04/2026", "1 archivo"], status: { label: "Vencida", tone: "danger" } },
];

export const pricingRows: DataRow[] = [
  { id: "1", primary: "Aceite de girasol 1,5 L", secondary: "DG-002841 · Supermercados Norte", values: [formatCurrency(1_487), "21%", "28%", formatCurrency(2_374), formatCurrency(438)], status: { label: "Vigente", tone: "success" } },
  { id: "2", primary: "Yerba mate tradicional 1 kg", secondary: "DG-001772 · Mercado del Centro", values: [formatCurrency(2_804), "21%", "31%", formatCurrency(4_672), formatCurrency(908)], status: { label: "Vigente", tone: "success" } },
  { id: "3", primary: "Harina de trigo 000 1 kg", secondary: "DG-003091 · Distribuidora Sur", values: [formatCurrency(694), "21%", "24%", formatCurrency(1_056), formatCurrency(184)], status: { label: "Por vencer", tone: "warning" } },
  { id: "4", primary: "Azúcar refinada 1 kg", secondary: "DG-000648 · Hiper Mayorista", values: [formatCurrency(918), "21%", "19%", formatCurrency(1_298), formatCurrency(126)], status: { label: "Revisión", tone: "info" } },
];

export const salesRows: DataRow[] = [
  { id: "1", primary: "Venta #V-10482", secondary: "OC-88741 · Supermercados Norte", values: ["22/06/2026", "18 líneas", "1.284 u.", formatCurrency(8_492_400), "ventas_jun_22.xlsx"], status: { label: "Confirmada", tone: "success" } },
  { id: "2", primary: "Venta #V-10481", secondary: "OC-44928 · Mercado del Centro", values: ["22/06/2026", "7 líneas", "422 u.", formatCurrency(2_188_900), "carga_manual"], status: { label: "Confirmada", tone: "success" } },
  { id: "3", primary: "Venta #V-10480", secondary: "OC-12873 · Distribuidora Sur", values: ["21/06/2026", "32 líneas", "3.084 u.", formatCurrency(14_702_000), "ventas_sur.xlsx"], status: { label: "Pendiente", tone: "warning" } },
  { id: "4", primary: "Venta #V-10479", secondary: "OC-77102 · Hiper Mayorista", values: ["20/06/2026", "12 líneas", "680 u.", formatCurrency(3_971_200), "ventas_hiper.xlsx"], status: { label: "Con errores", tone: "danger" } },
];

export const purchaseRows: DataRow[] = [
  { id: "1", primary: "Compra #C-05881", secondary: "TANGO-991284 · Molinos Río", values: ["22/06/2026", "OC-34081", "24 líneas", "4.840 u.", formatCurrency(21_940_000)], status: { label: "Recibida", tone: "success" } },
  { id: "2", primary: "Compra #C-05880", secondary: "TANGO-991271 · La Cachuera", values: ["21/06/2026", "OC-34079", "8 líneas", "1.200 u.", formatCurrency(8_203_000)], status: { label: "Parcial", tone: "warning" } },
  { id: "3", primary: "Compra #C-05879", secondary: "TANGO-991208 · Ledesma", values: ["20/06/2026", "OC-34062", "12 líneas", "2.400 u.", formatCurrency(7_829_000)], status: { label: "En tránsito", tone: "info" } },
  { id: "4", primary: "Compra #C-05878", secondary: "TANGO-991144 · Molinos Cañuelas", values: ["18/06/2026", "OC-34044", "14 líneas", "2.910 u.", formatCurrency(9_491_000)], status: { label: "Revisión", tone: "danger" } },
];
