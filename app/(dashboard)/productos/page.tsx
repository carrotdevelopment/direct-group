import { requirePageModule } from "@/server/lib/access";
import { ProductWorkspace } from "@/components/domain/product-workspace";

export const metadata = { title: "Productos" };

export default async function ProductosPage() {
  await requirePageModule("productos");
  return <ProductWorkspace />;
}
