import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { countPasajesToApprove } from "@/lib/pasajes-ajustes-db";

export const runtime = "nodejs";

// Cantidad de pasajes que esperan la aprobación del usuario (para el número del menú).
export async function GET() {
  const denied = await checkApiAccess(["pasajes"], false);
  if (denied) return denied;
  return NextResponse.json({ count: await countPasajesToApprove(await currentPasajeActor()) });
}
