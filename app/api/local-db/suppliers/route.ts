import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import {
  readSuppliersFromExcel,
  writeSuppliersToExcel,
  type ExcelSupplier,
} from "@/lib/local-excel-db";
import { normalizeForDuplicateCheck } from "@/lib/normalize";
import { usesPostgres } from "@/lib/data-source";
import {
  readSuppliersFromPostgres,
  writeSuppliersToPostgres,
} from "@/lib/postgres-replica-db";

export const runtime = "nodejs";

function canonicalMasterNameKey(value: string) {
  return normalizeForDuplicateCheck(value).replace(/[^A-Z0-9]+/g, " ");
}

export async function GET() {
  const denied = await checkApiAccess(["proveedores"], false);
  if (denied) return denied;
  const suppliers = usesPostgres()
    ? await readSuppliersFromPostgres()
    : readSuppliersFromExcel();
  return NextResponse.json({ suppliers, source: usesPostgres() ? "postgresql" : "excel" });
}

export async function PUT(request: Request) {
  const denied = await checkApiAccess(["proveedores"], true);
  if (denied) return denied;
  const body = (await request.json()) as { suppliers?: ExcelSupplier[] };
  const suppliers = body.suppliers ?? [];

  const seen = new Map<string, string>();
  for (const supplier of suppliers) {
    const key = canonicalMasterNameKey(supplier.name);
    if (!key) continue;
    if (seen.has(key)) {
      return NextResponse.json(
        { ok: false, message: `Ya existe un proveedor con el nombre "${seen.get(key)}".` },
        { status: 409 },
      );
    }
    seen.set(key, supplier.name.trim().replace(/\s+/g, " "));
  }

  if (usesPostgres()) {
    const saved = await writeSuppliersToPostgres(suppliers);
    return NextResponse.json({ suppliers: saved, source: "postgresql" });
  }
  writeSuppliersToExcel(suppliers);
  return NextResponse.json({ suppliers, source: "excel" });
}
