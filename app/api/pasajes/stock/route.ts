import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { availableStockForCodes } from "@/lib/pasaje-stock-db";

export const runtime = "nodejs";

// Stock disponible de un código cliente para pasar (stock real menos pasajes pendientes o aprobados).
export async function GET(request: Request) {
  const denied = await checkApiAccess(["pasajes"], false);
  if (denied) return denied;
  const url = new URL(request.url);
  const client = (url.searchParams.get("client") ?? "").trim();
  const code = (url.searchParams.get("code") ?? "").trim();
  if (!client || !code) return NextResponse.json({ message: "Falta el cliente o el código." }, { status: 400 });
  const stock = (await availableStockForCodes(client, [code])).get(code.toLowerCase());
  return NextResponse.json(stock ?? { real: 0, reserved: 0, available: 0 });
}
