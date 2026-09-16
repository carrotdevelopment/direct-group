import { checkApiAccess } from "@/server/lib/access";
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { cancelSync, requestSync, syncStatus, TangoSyncError } from "@/lib/tango-sync";
import { tangoRange } from "@/lib/tango-sync-contract";

export const runtime = "nodejs";
const bad = (message: string, status = 400) => NextResponse.json({ message }, { status });

async function actorId() {
  const session = await auth();
  return session?.user?.id ?? "desconocido";
}

export async function GET() {
  const denied = await checkApiAccess(["compras"], false);
  if (denied) return denied;
  return NextResponse.json(await syncStatus());
}

export async function POST(request: Request) {
  const denied = await checkApiAccess(["compras"], true);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad("El pedido no llegó con JSON válido.");
  }
  const parsed = tangoRange.safeParse(body);
  if (!parsed.success) return bad(parsed.error.issues[0]?.message ?? "Período inválido.");
  try {
    const job = await requestSync(parsed.data.from, parsed.data.to, await actorId());
    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof TangoSyncError) return bad(error.message, error.status);
    throw error;
  }
}

export async function DELETE(request: Request) {
  const denied = await checkApiAccess(["compras"], true);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return bad("Falta el id de la importación.");
  try {
    return NextResponse.json(await cancelSync(id));
  } catch (error) {
    if (error instanceof TangoSyncError) return bad(error.message, error.status);
    throw error;
  }
}
