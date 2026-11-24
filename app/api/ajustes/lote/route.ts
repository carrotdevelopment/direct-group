import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { PasajeAjusteError } from "@/lib/pasajes-ajustes-db";
import { createAjustes, previewAjustes } from "@/lib/ajuste-masivo-db";

export const runtime = "nodejs";

// Ajustes masivos de un cliente: con preview=true solo valida y muestra cómo queda el stock; si no, los carga.
export async function POST(request: Request) {
  const denied = await checkApiAccess(["pasajes"], true);
  if (denied) return denied;
  let body: { client?: unknown; rows?: unknown; preview?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "El pedido no llegó con JSON válido." }, { status: 400 });
  }
  try {
    const actor = await currentPasajeActor();
    const run = body.preview ? previewAjustes : createAjustes;
    return NextResponse.json(await run(body.client, body.rows, actor));
  } catch (error) {
    if (error instanceof PasajeAjusteError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
