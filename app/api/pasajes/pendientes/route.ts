import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { countPasajesWaiting } from "@/lib/pasajes-ajustes-db";

export const runtime = "nodejs";

// Pasajes que esperan al usuario, para el número del menú: por aprobar / por confirmar.
export async function GET() {
  const denied = await checkApiAccess(["pasajes"], false);
  if (denied) return denied;
  return NextResponse.json(await countPasajesWaiting(await currentPasajeActor()));
}
