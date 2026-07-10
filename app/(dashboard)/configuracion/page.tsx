import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Database,
  Folder,
  LockKeyhole,
  Save,
  Settings,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/domain/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { inspectLocalDataFolder } from "@/lib/local-data-health";

const sections = [{ label: "General", icon: Settings }, { label: "Usuarios y roles", icon: Users }, { label: "Seguridad", icon: LockKeyhole }, { label: "Notificaciones", icon: Bell }, { label: "Datos y backups", icon: Database }];

export const metadata = { title: "Configuración" };
export default function ConfiguracionPage() {
  const dataHealth = inspectLocalDataFolder();
  const requiredFiles = dataHealth.files.filter((file) => file.required);
  const generatedFiles = dataHealth.files.filter((file) => file.reviewRecommended);

  return (
    <>
      <PageHeader
        eyebrow="Sistema"
        title="Configuración"
        description="Preferencias operativas, controles de seguridad y parámetros globales de la organización."
      />
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="card h-fit animate-enter p-2">
          {sections.map((section, index) => (
            <button
              key={section.label}
              className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-xs font-bold ${index === 0 ? "bg-[#e9f1fb] text-[#0b5bbb]" : "text-[#60738d] hover:bg-[#f2f6fb]"}`}
            >
              <section.icon size={16} />
              {section.label}
            </button>
          ))}
        </aside>
        <div className="grid gap-4">
          <section className="card animate-enter p-5 sm:p-7" style={{ animationDelay: "50ms" }}>
            <div className="border-b border-[#e1e8f1] pb-5">
              <h2 className="text-lg font-black">Información general</h2>
              <p className="mt-1 text-xs text-[#62728a]">
                Datos de la organización y preferencias regionales.
              </p>
            </div>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Nombre de la organización" value="Direct Group" />
              <Field label="Razón social" value="Direct Group Argentina SA" />
              <Field label="CUIT" value="30-71824581-4" />
              <Field label="Zona horaria" value="America/Argentina/Buenos_Aires" />
              <Field label="Moneda predeterminada" value="ARS — Peso argentino" />
              <Field label="Idioma" value="Español (Argentina)" />
            </div>
            <div className="mt-7 flex justify-end border-t border-[#e1e8f1] pt-5">
              <Button>
                <Save size={15} /> Guardar cambios
              </Button>
            </div>
          </section>

          <section className="card animate-enter p-5 sm:p-7" style={{ animationDelay: "100ms" }}>
            <div className="flex flex-col gap-3 border-b border-[#e1e8f1] pb-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-black">
                  <Database size={18} /> Bases locales
                </h2>
                <p className="mt-1 text-xs text-[#62728a]">
                  Estado de la carpeta configurada en <code>DG_LOCAL_DB_DIR</code>. Estos archivos no se suben a GitHub.
                </p>
              </div>
              <Badge tone={dataHealth.ok ? "success" : "danger"}>
                {dataHealth.ok ? "Conectadas" : "Revisar"}
              </Badge>
            </div>

            <div className="mt-5 rounded-2xl border border-[#dbe4ef] bg-[#f8fbff] p-4">
              <div className="flex items-start gap-3">
                <Folder className="mt-0.5 text-[#0b5bbb]" size={18} />
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#6d7f95]">
                    Carpeta activa
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-[#263b57]">
                    {dataHealth.folder}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <Metric label="Archivos" value={String(dataHealth.totalFiles)} />
                <Metric label="Requeridos OK" value={`${dataHealth.presentRequired}/${requiredFiles.length}`} />
                <Metric label="Opcionales OK" value={String(dataHealth.presentOptional)} />
                <Metric label="Faltantes" value={String(dataHealth.missingRequired)} />
              </div>
            </div>

            {generatedFiles.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                <div className="flex gap-2">
                  <AlertTriangle size={16} />
                  <p>
                    Hay archivos requeridos muy livianos que parecen haber sido generados por la app como semilla:
                    {" "}
                    {generatedFiles.map((file) => file.fileName).join(", ")}. Conviene confirmar si corresponden a bases reales.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="mt-5 overflow-hidden rounded-2xl border border-[#dbe4ef]">
              <div className="grid grid-cols-[1fr_90px_90px] bg-[#f2f6fb] px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-[#6a7f98]">
                <span>Archivo requerido</span>
                <span>Estado</span>
                <span>Tamaño</span>
              </div>
              {requiredFiles.map((file) => (
                <div
                  key={file.fileName}
                  className="grid grid-cols-[1fr_90px_90px] items-center border-t border-[#e7edf5] px-4 py-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[#263b57]">{file.fileName}</p>
                    <p className="mt-0.5 truncate text-[11px] text-[#6b7f98]">{file.description}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 font-bold ${file.exists ? "text-emerald-700" : "text-red-700"}`}>
                    {file.exists ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {file.exists ? "OK" : "Falta"}
                  </span>
                  <span className="font-mono text-[11px] text-[#536980]">{file.sizeLabel}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return <label className="text-[11px] font-extrabold text-[#334b6b]">{label}<input defaultValue={value} className="mt-2 h-11 w-full rounded-xl border border-[#dbe4ef] bg-white px-3 text-xs outline-none focus:border-[#7da4d3] focus:ring-3 focus:ring-[#e5eef9]" /></label>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e1e8f1] bg-white p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#7b8da3]">{label}</p>
      <p className="mt-1 text-lg font-black text-[#243a57]">{value}</p>
    </div>
  );
}
