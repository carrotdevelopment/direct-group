import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { MailInboxError } from "@/lib/mail-inbox";
import { checkSupplierReplies } from "@/lib/supplier-mail";

export const runtime = "nodejs";
export const maxDuration = 120;

// Busca en la casilla de proveedores las respuestas al último pedido de catálogo de cada contacto.
export async function POST() {
  const denied = await checkApiAccess(["precios"], true);
  if (denied) return denied;
  try {
    return NextResponse.json(await checkSupplierReplies());
  } catch (error) {
    if (error instanceof MailInboxError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
