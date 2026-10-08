import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { createPasajesBatch, PasajeAjusteError, PasajeBatchError, type PasajeInput } from "@/lib/pasajes-ajustes-db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const denied = await checkApiAccess(["pasajes"], true);
  if (denied) return denied;
  let body: { rows?: PasajeInput[] };
  try {
    body = (await request.json()) as { rows?: PasajeInput[] };
  } catch {
    return NextResponse.json({ message: "El pedido no llegó con JSON válido." }, { status: 400 });
  }
  try {
    return NextResponse.json(await createPasajesBatch(body.rows ?? [], await currentPasajeActor()));
  } catch (error) {
    if (error instanceof PasajeBatchError) {
      return NextResponse.json({ message: error.message, rowErrors: error.rowErrors }, { status: error.status });
    }
    if (error instanceof PasajeAjusteError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
