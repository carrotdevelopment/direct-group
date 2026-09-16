import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import {
  readCategoriesFromExcel,
  writeCategoriesToExcel,
  type ExcelCategory,
} from "@/lib/local-excel-db";
import { normalizeForDuplicateCheck } from "@/lib/normalize";
import { usesPostgres } from "@/lib/data-source";
import {
  readCategoriesFromPostgres,
  writeCategoriesToPostgres,
} from "@/lib/postgres-replica-db";

export const runtime = "nodejs";

function canonicalMasterNameKey(value: string) {
  return normalizeForDuplicateCheck(value).replace(/[^A-Z0-9]+/g, " ");
}

export async function GET() {
  const denied = await checkApiAccess(["productos"], false);
  if (denied) return denied;
  const categories = usesPostgres()
    ? await readCategoriesFromPostgres()
    : readCategoriesFromExcel();
  return NextResponse.json({ categories, source: usesPostgres() ? "postgresql" : "excel" });
}

export async function PUT(request: Request) {
  const denied = await checkApiAccess(["productos"], true);
  if (denied) return denied;
  const body = (await request.json()) as { categories?: ExcelCategory[] };
  const categories = body.categories ?? [];

  const seen = new Map<string, string>();
  for (const category of categories) {
    const key = canonicalMasterNameKey(category.name);
    if (!key) continue;
    if (seen.has(key)) {
      return NextResponse.json(
        { ok: false, message: `Ya existe una categoría con el nombre "${seen.get(key)}".` },
        { status: 409 },
      );
    }
    seen.set(key, category.name.trim().replace(/\s+/g, " "));
  }

  if (usesPostgres()) {
    const saved = await writeCategoriesToPostgres(categories);
    return NextResponse.json({ categories: saved, source: "postgresql" });
  }
  writeCategoriesToExcel(categories);
  return NextResponse.json({ categories, source: "excel" });
}
