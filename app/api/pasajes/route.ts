import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { after, NextResponse } from "next/server";
import { notifyPasajes } from "@/server/lib/pasaje-notify";
import { createPasaje, listPasajes, PasajeAjusteError, type PasajeInput } from "@/lib/pasajes-ajustes-db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await checkApiAccess(["pasajes"], false);
  if (denied) return denied;
  const status = new URL(request.url).searchParams.get("status") ?? undefined;
  return NextResponse.json({ pasajes: await listPasajes(await currentPasajeActor(), status) });
}

// Pasaje cargado a mano. Los que Urbano informa como "Pasaje de stock" los crea la sincronización.
export async function POST(request: Request) {
  const denied = await checkApiAccess(["pasajes"], true);
  if (denied) return denied;
  const body = (await request.json()) as PasajeInput;
  try {
    const actor = await currentPasajeActor();
    const pasaje = await createPasaje(body, actor);
    // Aviso a la encargada del origen para que lo apruebe (después de responder).
    if (pasaje.status === "pending") after(() => notifyPasajes("aprobar", [pasaje.id], actor.name));
    return NextResponse.json({ pasaje });
  } catch (error) {
    if (error instanceof PasajeAjusteError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
