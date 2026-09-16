import { requirePageModule } from "@/server/lib/access";
import { ClientCodeWorkspace } from "@/components/domain/client-code-workspace";

export const metadata = { title: "Códigos cliente" };

export default async function CodigosClientesPage() {
  await requirePageModule("clientes");
  return <ClientCodeWorkspace />;
}
