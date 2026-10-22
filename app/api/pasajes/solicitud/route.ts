import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { PasajeAjusteError } from "@/lib/pasajes-ajustes-db";
import { createSolicitud, previewSolicitud } from "@/lib/pasaje-solicitud-db";

export const runtime = "nodejs";

// Solicitud de pasaje de stock a Urbano: con preview=true solo valida y resuelve las filas; si no,
// crea el lote con las filas válidas y avisa por correo a los representantes de cada destino.
export async function POST(request: Request) {
  const denied = await checkApiAccess(["pasajes"], true);
  if (denied) return denied;
  let body: { rows?: unknown; fileName?: unknown; preview?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "El pedido no llegó con JSON válido." }, { status: 400 });
  }
  try {
    if (body.preview) return NextResponse.json({ rows: await previewSolicitud(body.rows) });
    return NextResponse.json(await createSolicitud(body.rows, body.fileName, await currentPasajeActor()));
  } catch (error) {
    if (error instanceof PasajeAjusteError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
