import { requirePageModule } from "@/server/lib/access";
import { PageHeader } from "@/components/domain/page-header";
import { MailInboxWorkspace } from "@/components/domain/mail-inbox-workspace";

export const metadata = { title: "Correos" };

export default async function CorreosPage() {
  await requirePageModule("correos");
  return (
    <>
      <PageHeader
        eyebrow="Comunicación"
        title="Correos"
        description="Bandeja de entrada de proveedores@directgroup.com.ar. Solo lectura: abrir un correo desde acá no lo marca como leído ni cambia nada en la casilla."
      />
      <MailInboxWorkspace />
    </>
  );
}
