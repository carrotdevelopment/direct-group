import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { pasajeRangeSummary } from "@/lib/pasaje-batch-export-db";
import { PasajeAjusteError } from "@/lib/pasajes-ajustes-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD → cuántos pasajes se solicitaron entre esas fechas y de qué shippers.
export async function GET(request: Request) {
  const denied = await checkApiAccess(["pasajes"], false);
  if (denied) return denied;
  const query = new URL(request.url).searchParams;
  try {
    return NextResponse.json(await pasajeRangeSummary(await currentPasajeActor(), query.get("desde") ?? "", query.get("hasta") ?? ""));
  } catch (error) {
    if (error instanceof PasajeAjusteError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
