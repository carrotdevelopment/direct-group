import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { after, NextResponse } from "next/server";
import { notifyPasajes } from "@/server/lib/pasaje-notify";
import { approvePasajes, confirmPasajes, PasajeAjusteError } from "@/lib/pasajes-ajustes-db";

export const runtime = "nodejs";

type Body = { action?: "approve" | "confirm"; ids?: string[]; items?: { id: string; quantity: number }[] };

// Aprueba (encargada del origen) o confirma (encargada del destino, con la cantidad real) varios pasajes
// juntos. Cada pasaje se valida por separado.
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
    if (body.action === "approve") {
      const result = await approvePasajes(body.ids ?? [], actor);
      // Un solo correo por encargada del destino con todos los aprobados.
      if (result.done.length) after(() => notifyPasajes("recibir", result.done, actor.name));
      return NextResponse.json(result);
    }
    if (body.action === "confirm") return NextResponse.json(await confirmPasajes(body.items ?? [], actor));
    return NextResponse.json({ message: "Acción inválida." }, { status: 400 });
  } catch (error) {
    if (error instanceof PasajeAjusteError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
