import { requirePageModule } from "@/server/lib/access";
import { UrbanoStockWorkspace } from "@/components/domain/urbano-stock-workspace";

export const metadata = { title: "Carga de stock Urbano" };

export default async function UrbanoStockPage() {
  const user = await requirePageModule("stock");
  return <UrbanoStockWorkspace canWrite={user.role !== "LECTURA"} />;
}
