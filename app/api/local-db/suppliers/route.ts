import { NextResponse } from "next/server";
import {
  readSuppliersFromExcel,
  writeSuppliersToExcel,
  type ExcelSupplier,
} from "@/lib/local-excel-db";
import { normalizeForDuplicateCheck } from "@/lib/normalize";

export const runtime = "nodejs";

export function GET() {
  const suppliers = readSuppliersFromExcel();
  return NextResponse.json({ suppliers });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { suppliers?: ExcelSupplier[] };
  const suppliers = body.suppliers ?? [];

  const seen = new Map<string, string>();
  for (const supplier of suppliers) {
    const key = normalizeForDuplicateCheck(supplier.name);
    if (!key) continue;
    if (seen.has(key)) {
      return NextResponse.json(
        { ok: false, message: `Ya existe un proveedor con el nombre "${seen.get(key)}".` },
        { status: 409 },
      );
    }
    seen.set(key, supplier.name.trim().replace(/\s+/g, " "));
  }

  writeSuppliersToExcel(suppliers);
  return NextResponse.json({ suppliers });
}
