import { requirePageModule } from "@/server/lib/access";
import { PriceRequestWorkspace } from "@/components/domain/price-request-workspace";

export const metadata = { title: "Precios de proveedores" };

export default async function PreciosPage() {
  await requirePageModule("precios");
  return <PriceRequestWorkspace />;
}
