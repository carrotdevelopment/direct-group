import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { MailInboxError } from "@/lib/mail-inbox";
import { SupplierMailError, supplierReplyAttachments } from "@/lib/supplier-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Adjuntos de la respuesta del proveedor al último pedido.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await checkApiAccess(["precios"], false);
  if (denied) return denied;
  const { id } = await params;
  try {
    const attachments = await supplierReplyAttachments(id);
    return NextResponse.json({
      attachments: attachments.map(({ position, name, contentType, size }) => ({
        position, name, contentType, size, url: `/api/price-requests/contacts/${id}/adjuntos/${position}`,
      })),
    });
  } catch (error) {
    if (error instanceof SupplierMailError || error instanceof MailInboxError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
