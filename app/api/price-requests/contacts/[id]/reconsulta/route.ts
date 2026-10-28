import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { sendFollowUpToContact, SupplierMailError } from "@/lib/supplier-mail";

export const runtime = "nodejs";

// Reconsulta: le recuerda al proveedor el pedido de catálogo del mes.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await checkApiAccess(["precios"], true);
  if (denied) return denied;
  try {
    const result = await sendFollowUpToContact((await params).id);
    return NextResponse.json({ ok: true, message: `Reconsulta enviada a ${result.email}.` });
  } catch (error) {
    if (error instanceof SupplierMailError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
    throw error;
  }
}
