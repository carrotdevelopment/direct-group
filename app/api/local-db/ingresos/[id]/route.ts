import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { setTangoIncomePendingFlag } from "@/lib/tango-manual-entry";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await checkApiAccess(["compras"], true);
  if (denied) return denied;
  const { id } = await params;
  const body = (await request.json()) as { pendingTangoEntry?: boolean };
  if (typeof body.pendingTangoEntry !== "boolean") {
    return NextResponse.json({ message: "Falta indicar el nuevo estado." }, { status: 400 });
  }
  try {
    await setTangoIncomePendingFlag(id, body.pendingTangoEntry);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "No se pudo actualizar el estado." }, { status: 400 });
  }
}
