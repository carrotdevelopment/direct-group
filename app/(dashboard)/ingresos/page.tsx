import { requirePageModule } from "@/server/lib/access";
import { IncomeWorkspace } from "@/components/domain/income-workspace";

export const metadata = { title: "Ingresos" };

export default async function IngresosPage() {
  await requirePageModule("compras");
  return <IncomeWorkspace />;
}
