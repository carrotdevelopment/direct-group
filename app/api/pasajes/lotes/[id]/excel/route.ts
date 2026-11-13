import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { attachmentDisposition } from "@/lib/mail-inbox";
import { pasajeBatchExcel } from "@/lib/pasaje-batch-export-db";
import { PasajeAjusteError } from "@/lib/pasajes-ajustes-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ?formato=correo → solicitud para mandar a Urbano. ?formato=urbano (o urbano-id)&shipper=1258&cliente=Amex →
// planilla de egresos de ese shipper para subir en Urbano, en cada uno de los dos formatos.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await checkApiAccess(["pasajes"], false);
  if (denied) return denied;
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  try {
    const file = await pasajeBatchExcel(
      id, query.get("formato") ?? "", query.get("shipper") ?? "", query.get("cliente") ?? "", await currentPasajeActor(),
    );
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": attachmentDisposition(file.fileName),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof PasajeAjusteError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
