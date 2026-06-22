import { Download, Eye, FileCheck2, ShieldCheck, UserCog } from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";
import { SummaryStrip } from "@/components/domain/summary-strip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const events = [
  ["22/06/2026 · 11:48:22", "Juan Martín Bistue", "CONFIRM_IMPORT", "ImportBatch", "IMP-2026-0084", "186.12.14.28"],
  ["22/06/2026 · 11:42:09", "Worker de sistema", "CREATE_STOCK_MOVEMENTS", "StockMovimiento", "480 registros", "sistema"],
  ["22/06/2026 · 10:18:41", "María Gómez", "UPDATE_PRICING", "PricingCliente", "DG-002841", "190.18.42.91"],
  ["22/06/2026 · 09:57:30", "Carlos Díaz", "TRANSFER_STOCK", "StockTransfer", "TRF-005821", "181.10.8.44"],
];

export const metadata = { title: "Auditoría" };
export default function AuditoriaPage() {
  return <><PageHeader eyebrow="Sistema" title="Auditoría" description="Registro inmutable de acciones sensibles, cambios de negocio y operaciones automatizadas." secondaryAction={<Button variant="secondary"><Download size={15} /> Exportar</Button>} /><SummaryStrip items={[{ label: "Eventos hoy", value: "1.284", meta: "Sin anomalías", icon: ShieldCheck }, { label: "Usuarios activos", value: "12", meta: "4 roles", icon: UserCog, tone: "blue" }, { label: "Cambios sensibles", value: "38", meta: "Todos justificados", icon: Eye, tone: "orange" }, { label: "Integridad", value: "100%", meta: "Registro insert-only", icon: FileCheck2 }]} /><section className="card animate-enter overflow-hidden"><div className="border-b border-[#e8ebe8] px-5 py-4"><div className="text-sm font-black">Actividad reciente</div><div className="mt-1 text-[11px] text-[#808981]">Los eventos no pueden editarse ni eliminarse.</div></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left"><thead><tr className="bg-[#fafbfa] text-[9px] font-black uppercase tracking-[.11em] text-[#929a94]"><th className="px-5 py-3">Fecha y hora</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Acción</th><th className="px-4 py-3">Entidad</th><th className="px-4 py-3">Referencia</th><th className="px-4 py-3">Origen</th></tr></thead><tbody className="divide-y divide-[#edf0ed]">{events.map((event) => <tr key={event[0]} className="text-xs hover:bg-[#fafbfa]"><td className="px-5 py-4 font-mono text-[10px] text-[#747e76]">{event[0]}</td><td className="px-4 py-4 font-bold">{event[1]}</td><td className="px-4 py-4"><Badge tone="info">{event[2]}</Badge></td><td className="px-4 py-4 text-[#667169]">{event[3]}</td><td className="px-4 py-4 font-mono text-[10px]">{event[4]}</td><td className="px-4 py-4 text-[#7f8881]">{event[5]}</td></tr>)}</tbody></table></div></section></>;
}
