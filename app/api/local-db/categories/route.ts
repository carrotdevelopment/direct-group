import { NextResponse } from "next/server";
import {
  readCategoriesFromExcel,
  writeCategoriesToExcel,
  type ExcelCategory,
} from "@/lib/local-excel-db";
import { normalizeForDuplicateCheck } from "@/lib/normalize";

export const runtime = "nodejs";

function canonicalMasterNameKey(value: string) {
  return normalizeForDuplicateCheck(value).replace(/[^A-Z0-9]+/g, " ");
}

export function GET() {
  const categories = readCategoriesFromExcel();
  return NextResponse.json({ categories });
}

export async function PUT(request: Request) {
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

  writeCategoriesToExcel(categories);
  return NextResponse.json({ categories });
}
