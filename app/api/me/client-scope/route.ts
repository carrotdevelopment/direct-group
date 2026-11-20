import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { clientScopeFor } from "@/lib/client-scope";

export const runtime = "nodejs";

// Clientes cuyos datos ve quien está conectado, para que las pantallas ofrezcan solo esos.
export async function GET() {
  const user = (await auth())?.user;
  if (!user) return NextResponse.json({ message: "Iniciá sesión para continuar." }, { status: 401 });
  const scope = clientScopeFor(user);
  return NextResponse.json({ restricted: scope !== null, clients: scope ?? [] });
}
