import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { attachmentDisposition } from "@/lib/mail-inbox";
import { pasajeRangeExcel } from "@/lib/pasaje-batch-export-db";
import { PasajeAjusteError } from "@/lib/pasajes-ajustes-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ?desde&hasta&formato=correo → solicitud para Urbano con los pasajes solicitados entre esas fechas.
// ?desde&hasta&formato=urbano (o urbano-id)&shipper=1258&cliente=Amex → planilla de egresos de ese shipper.
export async function GET(request: Request) {
  const denied = await checkApiAccess(["pasajes"], false);
  if (denied) return denied;
  const query = new URL(request.url).searchParams;
  try {
    const file = await pasajeRangeExcel(
      await currentPasajeActor(), query.get("desde") ?? "", query.get("hasta") ?? "",
      query.get("formato") ?? "", query.get("shipper") ?? "", query.get("cliente") ?? "",
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
