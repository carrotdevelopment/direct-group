import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { MailInboxError } from "@/lib/mail-inbox";
import { checkSupplierLists } from "@/lib/supplier-lists";
import { checkSupplierReplies } from "@/lib/supplier-mail";

export const runtime = "nodejs";
export const maxDuration = 120;

// Busca en la casilla de proveedores las respuestas al último pedido de catálogo de cada contacto.
export async function POST() {
  const denied = await checkApiAccess(["precios"], true);
  if (denied) return denied;
  try {
    const replies = await checkSupplierReplies();
    const lists = await checkSupplierLists();
    return NextResponse.json({ ...replies, newLists: lists.created, errors: [...replies.errors, ...lists.errors] });
  } catch (error) {
    if (error instanceof MailInboxError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
