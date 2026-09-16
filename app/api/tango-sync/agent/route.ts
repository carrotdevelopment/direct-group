import { NextResponse } from "next/server";
import { handleAgent, TangoSyncError, validConnectorToken } from "@/lib/tango-sync";
import { agentRequest } from "@/lib/tango-sync-contract";

export const runtime = "nodejs";

// This endpoint is called by the DG Tango Sync Agent running inside the
// company network (see docs/ADR-002-TANGO-INGRESOS-INTEGRATION.md), never
// by a browser. Auth is a bearer connector token, not a user session.
export async function POST(request: Request) {
  if (!validConnectorToken(request.headers.get("authorization"))) {
    return NextResponse.json({ message: "Token de conector inválido." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "El pedido no llegó con JSON válido." }, { status: 400 });
  }
  const parsed = agentRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Pedido inválido." }, { status: 400 });
  }
  try {
    return NextResponse.json(await handleAgent(parsed.data));
  } catch (error) {
    if (error instanceof TangoSyncError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
