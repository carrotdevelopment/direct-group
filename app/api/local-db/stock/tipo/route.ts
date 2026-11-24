import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inClientScope } from "@/lib/client-scope";
import { isCodeType, usesCodeType } from "@/lib/code-type";
import { saveCodeTypes } from "@/lib/code-type-db";
import { usesPostgres } from "@/lib/data-source";
import { checkApiAccess, clientForbidden, currentClientScope } from "@/server/lib/access";

export const runtime = "nodejs";

// Pasa códigos de regular a especial y viceversa.
export async function POST(request: Request) {
  const denied = await checkApiAccess(["stock"], true);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { client?: unknown; codes?: unknown; type?: unknown } | null;
  const client = String(body?.client ?? "").trim();
  if (!usesCodeType(client)) return NextResponse.json({ message: "Regular y especial es solo para Credicoop." }, { status: 400 });
  if (!inClientScope(await currentClientScope(), client)) return clientForbidden();
  if (!usesPostgres()) return NextResponse.json({ message: "Solo se puede con la base de datos." }, { status: 400 });
  const codes = body?.codes;
  if (!isCodeType(body?.type) || !Array.isArray(codes) || !codes.length || codes.length > 5000 || !codes.every((code) => typeof code === "string")) {
    return NextResponse.json({ message: "Faltan los códigos o el tipo." }, { status: 400 });
  }
  const user = (await auth())?.user;
  const saved = await saveCodeTypes("Credicoop", codes, body.type, user?.email || user?.name || "");
  if (!saved.length) return NextResponse.json({ message: "No se encontró el código en Credicoop." }, { status: 404 });
  return NextResponse.json({ codes: saved });
}
