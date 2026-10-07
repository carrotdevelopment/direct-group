import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { createSupplierMailContact, listSupplierMailContacts, SupplierMailError } from "@/lib/supplier-mail";

export const runtime = "nodejs";

export async function GET() {
  const denied = await checkApiAccess(["precios"], false);
  if (denied) return denied;
  return NextResponse.json({ contacts: await listSupplierMailContacts() });
}

export async function POST(request: Request) {
  const denied = await checkApiAccess(["precios"], true);
  if (denied) return denied;
  try {
    const contact = await createSupplierMailContact(await request.json());
    return NextResponse.json({ contact });
  } catch (error) {
    if (error instanceof SupplierMailError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
