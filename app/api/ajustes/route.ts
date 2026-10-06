import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { AjusteInput, createAjuste, listAjustes, PasajeAjusteError } from "@/lib/pasajes-ajustes-db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await checkApiAccess(["pasajes"], false);
  if (denied) return denied;
  const status = new URL(request.url).searchParams.get("status") ?? undefined;
  return NextResponse.json({ ajustes: await listAjustes(await currentPasajeActor(), status) });
}

export async function POST(request: Request) {
  const denied = await checkApiAccess(["pasajes"], true);
  if (denied) return denied;
  const body = (await request.json()) as AjusteInput;
  try {
    const ajuste = await createAjuste(body, await currentPasajeActor());
    return NextResponse.json({ ajuste });
  } catch (error) {
    if (error instanceof PasajeAjusteError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    throw error;
  }
}
