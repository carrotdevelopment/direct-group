import { requirePageModule } from "@/server/lib/access";
import { SupplierAdminWorkspace } from "@/components/domain/supplier-admin-workspace";

export const metadata = { title: "Proveedores" };

export default async function ProveedoresPage() {
  await requirePageModule("proveedores");
  return <SupplierAdminWorkspace />;
}
