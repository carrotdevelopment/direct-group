import { CheckCircle2, Database, RefreshCw, ServerCog, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const integrations = [
  { name: "Tango Gestión", description: "Compras, órdenes y maestros comerciales", icon: Database, status: "Conectado", last: "Última sincronización hace 12 min", tone: "success" as const },
  { name: "OpenAI", description: "Interpretación de documentos y mapeos", icon: Sparkles, status: "Configurado", last: "84 ejecuciones este mes", tone: "success" as const },
  { name: "Redis / BullMQ", description: "Procesamiento asíncrono y reintentos", icon: ServerCog, status: "Operativo", last: "2 jobs activos · 0 fallidos", tone: "success" as const },
];

export const metadata = { title: "Integraciones" };
export default function IntegracionesPage() {
  return <><PageHeader eyebrow="Sistema" title="Integraciones" description="Estado, configuración y trazabilidad de los servicios conectados a la plataforma." action="Nueva integración" /><div className="grid gap-4 lg:grid-cols-3">{integrations.map((item, index) => <article key={item.name} className="card animate-enter p-5" style={{ animationDelay: `${index * 55}ms` }}><div className="flex items-start justify-between"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8f2ec] text-[#1f6b48]"><item.icon size={20} /></div><Badge tone={item.tone} dot>{item.status}</Badge></div><h2 className="mt-5 text-base font-black">{item.name}</h2><p className="mt-1 text-xs leading-5 text-[#788179]">{item.description}</p><div className="mt-5 flex items-center gap-2 border-t border-[#edf0ed] pt-4 text-[10px] font-semibold text-[#8a928c]"><CheckCircle2 size={13} className="text-[#3d9464]" />{item.last}</div><Button variant="secondary" size="sm" className="mt-4 w-full"><RefreshCw size={14} /> Administrar</Button></article>)}</div></>;
}
