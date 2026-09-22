import { checkApiAccess } from "@/server/lib/access";
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { PasajeAjusteError, respondAjuste } from "@/lib/pasajes-ajustes-db";

export const runtime = "nodejs";

async function actorId() {
  const session = await auth();
  return session?.user?.name || session?.user?.email || "desconocido";
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await checkApiAccess(["pasajes"], true);
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json()) as { action?: "accept" | "reject"; comment?: string };
  if (body.action !== "accept" && body.action !== "reject") {
    return NextResponse.json({ message: "Acción inválida." }, { status: 400 });
  }
  try {
    const ajuste = await respondAjuste(id, body.action, await actorId(), body.comment);
    return NextResponse.json({ ajuste });
  } catch (error) {
    if (error instanceof PasajeAjusteError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
