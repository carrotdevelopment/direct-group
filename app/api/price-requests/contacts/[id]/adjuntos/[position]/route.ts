import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { attachmentDisposition, MailInboxError } from "@/lib/mail-inbox";
import { SupplierMailError, supplierReplyAttachment } from "@/lib/supplier-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tipos que el navegador muestra solo y no pueden ejecutar código: se abren en la misma pestaña.
// El resto (Excel, Word, HTML, SVG...) se descarga, como en Correos.
const VIEWABLE = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"]);

function viewableType(name: string, contentType: string) {
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (VIEWABLE.has(type)) return type;
  const extension = name.toLowerCase().split(".").pop() ?? "";
  const byExtension: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
  return byExtension[extension] ?? null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; position: string }> }) {
  const denied = await checkApiAccess(["precios"], false);
  if (denied) return denied;
  const { id, position } = await params;
  try {
    const file = await supplierReplyAttachment(id, Number(position));
    const type = viewableType(file.name, file.contentType);
    const disposition = attachmentDisposition(file.name);
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": type ?? "application/octet-stream",
        "Content-Disposition": type ? disposition.replace(/^attachment/, "inline") : disposition,
        "Content-Security-Policy": "sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof SupplierMailError || error instanceof MailInboxError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
