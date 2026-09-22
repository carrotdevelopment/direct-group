import { checkApiAccess } from "@/server/lib/access";
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { AjusteInput, createAjuste, listAjustes, PasajeAjusteError } from "@/lib/pasajes-ajustes-db";

export const runtime = "nodejs";

async function actorId() {
  const session = await auth();
  return session?.user?.name || session?.user?.email || "desconocido";
}

export async function GET(request: Request) {
  const denied = await checkApiAccess(["pasajes"], false);
  if (denied) return denied;
  const status = new URL(request.url).searchParams.get("status") ?? undefined;
  return NextResponse.json({ ajustes: await listAjustes(status) });
}

export async function POST(request: Request) {
  const denied = await checkApiAccess(["pasajes"], true);
  if (denied) return denied;
  const body = (await request.json()) as AjusteInput;
  try {
    const ajuste = await createAjuste(body, await actorId());
    return NextResponse.json({ ajuste });
  } catch (error) {
    if (error instanceof PasajeAjusteError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
