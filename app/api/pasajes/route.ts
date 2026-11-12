import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { listPasajes } from "@/lib/pasajes-ajustes-db";

export const runtime = "nodejs";

// Los pasajes no se cargan a mano: los crea la sincronización con Urbano desde cada salida por pasaje.
export async function GET(request: Request) {
  const denied = await checkApiAccess(["pasajes"], false);
  if (denied) return denied;
  const status = new URL(request.url).searchParams.get("status") ?? undefined;
  return NextResponse.json({ pasajes: await listPasajes(await currentPasajeActor(), status) });
}
