import { Clock3, FileCheck2, FileWarning, Sparkles } from "lucide-react";
import { ImportCenter } from "@/components/domain/import-center";
import { PageHeader } from "@/components/domain/page-header";
import { SummaryStrip } from "@/components/domain/summary-strip";

export const metadata = { title: "Importaciones" };
export default function ImportacionesPage() {
  return <><PageHeader eyebrow="Importaciones" title="Centro de importaciones" description="Procesá archivos variables con asistencia inteligente, validación estricta y confirmación humana." /><SummaryStrip items={[{ label: "Procesadas este mes", value: "84", meta: "18.420 filas", icon: FileCheck2 }, { label: "En procesamiento", value: "2", meta: "Progreso promedio 68%", icon: Sparkles, tone: "blue" }, { label: "Esperando revisión", value: "3", meta: "Mapeo o matching", icon: Clock3, tone: "orange" }, { label: "Con errores", value: "1", meta: "Archivo incompleto", icon: FileWarning, tone: "red" }]} /><ImportCenter /></>;
}
