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
  { id: "1", primary: "Macro", secondary: "CLI-00001", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
  { id: "2", primary: "Provincia", secondary: "CLI-00002", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
  { id: "3", primary: "Producteca", secondary: "CLI-00003", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
  { id: "4", primary: "Credicoop REG", secondary: "CLI-00004", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
  { id: "5", primary: "HSBC", secondary: "CLI-00005", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
  { id: "6", primary: "Santander", secondary: "CLI-00006", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
  { id: "7", primary: "Credicoop ES", secondary: "CLI-00007", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
  { id: "8", primary: "Massalin", secondary: "CLI-00008", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
  { id: "9", primary: "Pampa", secondary: "CLI-00009", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
  { id: "10", primary: "CTC", secondary: "CLI-00010", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
  { id: "11", primary: "Supervielle", secondary: "CLI-00011", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
  { id: "12", primary: "Amex Futuro", secondary: "CLI-00012", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
  { id: "13", primary: "Amex", secondary: "CLI-00013", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
  { id: "14", primary: "Comafi", secondary: "CLI-00014", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
  { id: "15", primary: "Importados", secondary: "CLI-00015", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
  { id: "16", primary: "Syngenta", secondary: "CLI-00016", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
  { id: "17", primary: "Umiles", secondary: "CLI-00017", values: ["Sin definir", "0 productos", "0 códigos propios", "—", "Sin actividad"], status: { label: "Activo", tone: "success" } },
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
