import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { PasajeAjusteError, respondPasaje } from "@/lib/pasajes-ajustes-db";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await checkApiAccess(["pasajes"], true);
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json()) as { action?: "accept" | "reject"; comment?: string };
  if (body.action !== "accept" && body.action !== "reject") {
    return NextResponse.json({ message: "Acción inválida." }, { status: 400 });
  }
  try {
    const pasaje = await respondPasaje(id, body.action, await currentPasajeActor(), body.comment);
    return NextResponse.json({ pasaje });
  } catch (error) {
    if (error instanceof PasajeAjusteError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
