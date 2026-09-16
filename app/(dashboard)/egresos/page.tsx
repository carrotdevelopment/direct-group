import { requirePageModule } from "@/server/lib/access";
import { EgressWorkspace } from "@/components/domain/egress-workspace";

export const metadata = { title: "Egresos" };

export default async function EgresosPage() {
  await requirePageModule("ventas");
  return <EgressWorkspace />;
}
