import { requirePageModule } from "@/server/lib/access";
import { StockWorkspace } from "@/components/domain/stock-workspace";

export const metadata = { title: "Stock" };

export default async function StockPage() {
  await requirePageModule("stock");
  return <StockWorkspace />;
}
