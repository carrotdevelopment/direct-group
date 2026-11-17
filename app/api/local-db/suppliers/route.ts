import { auth } from "@/auth";
import { checkApiAccess } from "@/server/lib/access";
import { prisma } from "@/server/lib/prisma";
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
  const [suppliers, managers, session] = await Promise.all([
    usesPostgres() ? readSuppliersFromPostgres() : readSuppliersFromExcel(),
    // Usuarios activos que se pueden elegir como encargado de un proveedor.
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    auth(),
  ]);
  return NextResponse.json({
    suppliers,
    managers,
    currentUserId: session?.user?.id ?? null,
    source: usesPostgres() ? "postgresql" : "excel",
  });
}

export async function PUT(request: Request) {
  const denied = await checkApiAccess(["proveedores"], true);
  if (denied) return denied;
  const body = (await request.json()) as { suppliers?: ExcelSupplier[] };
  const suppliers = body.suppliers ?? [];
  const managerIds = [...new Set(suppliers.map((supplier) => supplier.managerUserId).filter((id): id is string => !!id))];
  if (managerIds.length) {
    const found = await prisma.user.count({ where: { id: { in: managerIds } } });
    if (found !== managerIds.length) {
      return NextResponse.json({ ok: false, message: "El encargado elegido no es un usuario de la plataforma." }, { status: 400 });
    }
  }

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
