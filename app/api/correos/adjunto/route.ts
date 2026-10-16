import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { attachmentDisposition, getInboxAttachment, MailInboxError } from "@/lib/mail-inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Descarga un adjunto. Siempre como descarga (nunca se muestra dentro de la plataforma), para que
// un archivo HTML o SVG recibido por correo no pueda ejecutarse en el sitio.
export async function GET(request: Request) {
  const denied = await checkApiAccess(["correos"], false);
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  try {
    const file = await getInboxAttachment(params.get("messageId") ?? "", Number(params.get("index")));
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": attachmentDisposition(file.name),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof MailInboxError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
