import { requirePageModule } from "@/server/lib/access";
import { ClientAdminWorkspace } from "@/components/domain/client-admin-workspace";

export const metadata = { title: "Clientes" };
export default async function ClientesPage() {
  await requirePageModule("clientes");
  return <ClientAdminWorkspace />;
}
