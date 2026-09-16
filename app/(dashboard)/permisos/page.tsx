import { requirePageModule } from "@/server/lib/access";
import { PermissionsWorkspace } from "@/components/domain/permissions-workspace";

export default async function PermissionsPage() {
  const user = await requirePageModule("admin");
  return <PermissionsWorkspace currentUserId={user.id} />;
}
