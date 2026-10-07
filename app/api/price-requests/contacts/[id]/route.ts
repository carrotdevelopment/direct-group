import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import {
  deleteSupplierMailContact,
  sendPriceRequestToContact,
  SupplierMailError,
  updateSupplierMailContact,
} from "@/lib/supplier-mail";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

function fail(error: unknown) {
  if (error instanceof SupplierMailError) return NextResponse.json({ message: error.message }, { status: error.status });
  throw error;
}

export async function PUT(request: Request, { params }: Context) {
  const denied = await checkApiAccess(["precios"], true);
  if (denied) return denied;
  try {
    const contact = await updateSupplierMailContact((await params).id, await request.json());
    return NextResponse.json({ contact });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const denied = await checkApiAccess(["precios"], true);
  if (denied) return denied;
  try {
    await deleteSupplierMailContact((await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

// Envío de prueba inmediato a este contacto (no reemplaza el envío automático del mes).
export async function POST(_request: Request, { params }: Context) {
  const denied = await checkApiAccess(["precios"], true);
  if (denied) return denied;
  try {
    const result = await sendPriceRequestToContact((await params).id, "test");
    return NextResponse.json({ ok: true, message: `Mail enviado a ${result.email}.`, from: result.from });
  } catch (error) {
    if (error instanceof SupplierMailError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 200 });
    }
    throw error;
  }
}
