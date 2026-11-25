import { requirePageModule } from "@/server/lib/access";
import { PASAJES_ALL } from "@/lib/module-access";
import { PageHeader } from "@/components/domain/page-header";
import { PasajesWorkspace } from "@/components/domain/pasajes-workspace";

export const metadata = { title: "Pasajes" };

export default async function PasajesPage() {
  const user = await requirePageModule("pasajes");
  return (
    <>
      <PageHeader title="Pasajes" />
      <PasajesWorkspace
        restrictedClients={user.role === "ADMIN" ? null : (user.pasajeClients ?? [])}
        userName={user.name || user.email || ""}
        seesAll={user.role !== "ADMIN" && user.moduleAccess.includes(PASAJES_ALL)}
      />
    </>
  );
}
