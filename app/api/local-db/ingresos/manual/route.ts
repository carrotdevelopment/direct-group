import { checkApiAccess } from "@/server/lib/access";
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { createManualTangoIncome, manualTangoIncomeSchema } from "@/lib/tango-manual-entry";

export const runtime = "nodejs";
const bad = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });

export async function POST(request: Request) {
  const denied = await checkApiAccess(["compras"], true);
  if (denied) return denied;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bad("El pedido no llegó con JSON válido.");
  }
  const parsed = manualTangoIncomeSchema.safeParse(body);
  if (!parsed.success) {
    return bad(parsed.error.issues[0]?.message || "Revisá los datos del movimiento.");
  }
  const session = await auth();
  const actor = session?.user?.email ?? session?.user?.id ?? "desconocido";
  const created = await createManualTangoIncome(parsed.data, actor);
  return NextResponse.json({ ok: true, id: created.id.toString() });
}
