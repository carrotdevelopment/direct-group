import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { confirmPasajes, PasajeAjusteError, respondPasajes } from "@/lib/pasajes-ajustes-db";

export const runtime = "nodejs";

type Body = { action?: "approve" | "reject" | "confirm"; ids?: string[]; items?: { id: string; quantity: number }[]; comment?: string };

// Resuelve varios pasajes juntos: aprobar o rechazar (primera aprobación) o confirmar la cantidad
// real informada por Urbano (segunda aprobación). Cada pasaje se valida por separado.
export async function POST(request: Request) {
  const denied = await checkApiAccess(["pasajes"], true);
  if (denied) return denied;
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "El pedido no llegó con JSON válido." }, { status: 400 });
  }
  try {
    const actor = await currentPasajeActor();
    if (body.action === "confirm") return NextResponse.json(await confirmPasajes(body.items ?? [], actor));
    if (body.action === "approve" || body.action === "reject") {
      return NextResponse.json(await respondPasajes(body.ids ?? [], body.action, actor, body.comment));
    }
    return NextResponse.json({ message: "Acción inválida." }, { status: 400 });
  } catch (error) {
    if (error instanceof PasajeAjusteError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
