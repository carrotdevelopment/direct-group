import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { listPasajeBatches } from "@/lib/pasaje-batch-export-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lotes de pasajes recientes, para descargar los Excel que se mandan y se suben en Urbano.
export async function GET() {
  const denied = await checkApiAccess(["pasajes"], false);
  if (denied) return denied;
  return NextResponse.json({ batches: await listPasajeBatches(await currentPasajeActor()) });
}
