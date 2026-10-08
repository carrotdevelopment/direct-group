import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { confirmPasaje, PasajeAjusteError, respondPasaje } from "@/lib/pasajes-ajustes-db";

export const runtime = "nodejs";

type Body = { action?: "approve" | "accept" | "reject" | "confirm"; comment?: string; quantity?: number };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await checkApiAccess(["pasajes"], true);
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json()) as Body;
  try {
    const actor = await currentPasajeActor();
    if (body.action === "confirm") {
      return NextResponse.json({ pasaje: await confirmPasaje(id, Number(body.quantity), actor) });
    }
    if (body.action !== "approve" && body.action !== "accept" && body.action !== "reject") {
      return NextResponse.json({ message: "Acción inválida." }, { status: 400 });
    }
    const pasaje = await respondPasaje(id, body.action === "reject" ? "reject" : "approve", actor, body.comment);
    return NextResponse.json({ pasaje });
  } catch (error) {
    if (error instanceof PasajeAjusteError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
