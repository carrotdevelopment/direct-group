import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { urbanoOutgoingsWithoutPasaje } from "@/lib/pasajes-ajustes-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Salidas que Urbano marcó como pasaje de stock en los últimos 30 días y no tienen un pasaje cargado.
export async function GET() {
  const denied = await checkApiAccess(["pasajes"], false);
  if (denied) return denied;
  return NextResponse.json({ outgoings: await urbanoOutgoingsWithoutPasaje() });
}
