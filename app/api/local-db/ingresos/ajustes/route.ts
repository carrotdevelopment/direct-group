import { checkApiAccess, clientForbidden, currentClientScope } from "@/server/lib/access";
import { inClientScope } from "@/lib/client-scope";
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { AjusteError, createAjustes, previewAjustes } from "@/lib/ajuste-masivo-db";

export const runtime = "nodejs";

// Ajustes masivos que suman stock a un cliente: con preview=true solo valida y muestra cómo queda; si no, los carga.
export async function POST(request: Request) {
  const denied = await checkApiAccess(["compras"], true);
  if (denied) return denied;
  let body: { client?: unknown; rows?: unknown; preview?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "El pedido no llegó con JSON válido." }, { status: 400 });
  }
  if (!inClientScope(await currentClientScope(), body.client)) return clientForbidden();
  try {
    if (body.preview) return NextResponse.json(await previewAjustes(body.client, body.rows, "suma"));
    const session = await auth();
    return NextResponse.json(await createAjustes(body.client, body.rows, "suma", session?.user?.email ?? session?.user?.id ?? "desconocido"));
  } catch (error) {
    if (error instanceof AjusteError) return NextResponse.json({ message: error.message }, { status: 400 });
    throw error;
  }
}
