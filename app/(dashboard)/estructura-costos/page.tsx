import { requirePageModule } from "@/server/lib/access";
import { CostStructureWorkspace } from "@/components/domain/cost-structure-workspace";

export const metadata = { title: "Estructura de costos" };

export default async function EstructuraCostosPage() {
  await requirePageModule("precios");
  return <CostStructureWorkspace />;
}
