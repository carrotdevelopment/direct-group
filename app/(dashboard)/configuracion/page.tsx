import { Bell, Database, LockKeyhole, Save, Settings, Users } from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";

const sections = [{ label: "General", icon: Settings }, { label: "Usuarios y roles", icon: Users }, { label: "Seguridad", icon: LockKeyhole }, { label: "Notificaciones", icon: Bell }, { label: "Datos y backups", icon: Database }];

export const metadata = { title: "Configuración" };
export default function ConfiguracionPage() {
  return <><PageHeader eyebrow="Sistema" title="Configuración" description="Preferencias operativas, controles de seguridad y parámetros globales de la organización." /><div className="grid gap-4 lg:grid-cols-[240px_1fr]"><aside className="card h-fit animate-enter p-2">{sections.map((section, index) => <button key={section.label} className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-xs font-bold ${index === 0 ? "bg-[#e8f2ec] text-[#1f6b48]" : "text-[#667169] hover:bg-[#f4f6f4]"}`}><section.icon size={16} />{section.label}</button>)}</aside><section className="card animate-enter p-5 sm:p-7" style={{ animationDelay: "50ms" }}><div className="border-b border-[#e8ebe8] pb-5"><h2 className="text-lg font-black">Información general</h2><p className="mt-1 text-xs text-[#7b847d]">Datos de la organización y preferencias regionales.</p></div><div className="mt-6 grid gap-5 sm:grid-cols-2"><Field label="Nombre de la organización" value="Direct Group" /><Field label="Razón social" value="Direct Group Argentina SA" /><Field label="CUIT" value="30-71824581-4" /><Field label="Zona horaria" value="America/Argentina/Buenos_Aires" /><Field label="Moneda predeterminada" value="ARS — Peso argentino" /><Field label="Idioma" value="Español (Argentina)" /></div><div className="mt-7 flex justify-end border-t border-[#e8ebe8] pt-5"><Button><Save size={15} /> Guardar cambios</Button></div></section></div></>;
}

function Field({ label, value }: { label: string; value: string }) {
  return <label className="text-[11px] font-extrabold text-[#4e5a52]">{label}<input defaultValue={value} className="mt-2 h-11 w-full rounded-xl border border-[#dfe4df] bg-white px-3 text-xs outline-none focus:border-[#8faf9a] focus:ring-3 focus:ring-[#e2ede6]" /></label>;
}
