import { auth } from "@/auth";
import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import {
  applyEgressProductChange,
  EgressChangeError,
  listEgressProductChanges,
  previewEgressProductChange,
} from "@/lib/egress-product-change-db";

export const runtime = "nodejs";

// Historial de cambios de producto de un canje.
export async function GET(request: Request) {
  const denied = await checkApiAccess(["ventas"], false);
  if (denied) return denied;
  const id = Number(new URL(request.url).searchParams.get("id"));
  return NextResponse.json({ changes: await listEgressProductChanges(id) });
}

// Cambia el producto (y la cantidad) de un canje. Con preview=true solo devuelve el impacto en el stock.
export async function POST(request: Request) {
  const denied = await checkApiAccess(["ventas"], true);
  if (denied) return denied;
  let body: { id?: unknown; client?: unknown; clientCode?: unknown; quantity?: unknown; reason?: unknown; preview?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "El pedido no llegó con JSON válido." }, { status: 400 });
  }
  const input = {
    id: Number(body.id),
    client: String(body.client ?? ""),
    clientCode: String(body.clientCode ?? ""),
    quantity: Number(body.quantity),
    reason: String(body.reason ?? ""),
  };
  try {
    if (body.preview) return NextResponse.json({ impact: await previewEgressProductChange(input) });
    const user = (await auth())?.user;
    const actor = user?.name || user?.email || "desconocido";
    return NextResponse.json({ ok: true, impact: await applyEgressProductChange(input, actor) });
  } catch (error) {
    if (error instanceof EgressChangeError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
