import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { availableStockForCodes } from "@/lib/pasaje-stock-db";
import { latestUrbanoStockForCode } from "@/lib/urbano-stock-db";

export const runtime = "nodejs";

// Stock disponible de un código cliente para pasar (stock real menos pasajes abiertos que todavía no egresaron).
export async function GET(request: Request) {
  const denied = await checkApiAccess(["pasajes"], false);
  if (denied) return denied;
  const url = new URL(request.url);
  const client = (url.searchParams.get("client") ?? "").trim();
  const code = (url.searchParams.get("code") ?? "").trim();
  if (!client || !code) return NextResponse.json({ message: "Falta el cliente o el código." }, { status: 400 });
  const [stocks, urbano] = await Promise.all([
    availableStockForCodes(client, [code]),
    latestUrbanoStockForCode(client, code).catch(() => null),
  ]);
  // urbano: Cant. Física de la última carga de Urbano que trae el código (0 si no figura; null si el cliente no trabaja con Urbano).
  return NextResponse.json({ ...(stocks.get(code.toLowerCase()) ?? { real: 0, reserved: 0, available: 0 }), urbano });
}
