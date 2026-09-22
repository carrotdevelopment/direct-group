import { requirePageModule } from "@/server/lib/access";
import { PageHeader } from "@/components/domain/page-header";
import { PasajesWorkspace } from "@/components/domain/pasajes-workspace";

export const metadata = { title: "Pasajes y Ajustes" };

export default async function PasajesPage() {
  await requirePageModule("pasajes");
  return (
    <>
      <PageHeader
        eyebrow="Movimientos"
        title="Pasajes y Ajustes"
        description="Pasajes de stock entre clientes (con aceptación de la contraparte) y ajustes de stock por rotura, faltante o sobrante."
      />
      <PasajesWorkspace />
    </>
  );
}
