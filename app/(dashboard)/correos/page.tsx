import { requirePageModule } from "@/server/lib/access";
import { PageHeader } from "@/components/domain/page-header";
import { MailInboxWorkspace } from "@/components/domain/mail-inbox-workspace";

export const metadata = { title: "Correos" };

export default async function CorreosPage() {
  await requirePageModule("correos");
  return (
    <>
      <PageHeader title="Correos" />
      <MailInboxWorkspace />
    </>
  );
}
