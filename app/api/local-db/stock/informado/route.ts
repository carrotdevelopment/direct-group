import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inClientScope } from "@/lib/client-scope";
import { usesPostgres } from "@/lib/data-source";
import { parseInformado } from "@/lib/stock-informado";
import { saveInformado } from "@/lib/stock-informado-db";
import { checkApiAccess, clientForbidden, currentClientScope } from "@/server/lib/access";

export const runtime = "nodejs";

// Guarda el stock informado de uno o varios códigos, para todos. Cantidad vacía = sin informar.
export async function POST(request: Request) {
  const denied = await checkApiAccess(["stock"], true);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { client?: unknown; values?: unknown } | null;
  const client = String(body?.client ?? "").trim();
  if (!client) return NextResponse.json({ message: "Falta el cliente." }, { status: 400 });
  if (!inClientScope(await currentClientScope(), client)) return clientForbidden();
  if (!usesPostgres()) return NextResponse.json({ message: "Solo se puede con la base de datos." }, { status: 400 });
  const input = body?.values;
  if (!Array.isArray(input) || !input.length || input.length > 5000) {
    return NextResponse.json({ message: "Faltan los códigos." }, { status: 400 });
  }
  const values: { code: string; quantity: number | null }[] = [];
  for (const raw of input as ({ code?: unknown; quantity?: unknown } | null)[]) {
    const code = String(raw?.code ?? "").trim();
    const quantity = parseInformado(raw?.quantity);
    if (!code || quantity === undefined) {
      return NextResponse.json({ message: `El stock informado de ${code || "una fila"} no es un número entero.` }, { status: 400 });
    }
    values.push({ code, quantity });
  }
  const user = (await auth())?.user;
  const saved = await saveInformado(client, values, user?.email || user?.name || "desconocido");
  if (!saved.size) return NextResponse.json({ message: `No se encontró el código en ${client}.` }, { status: 404 });
  return NextResponse.json({ saved: Object.fromEntries(saved) });
}
