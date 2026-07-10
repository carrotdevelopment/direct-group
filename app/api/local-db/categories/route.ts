import { NextResponse } from "next/server";
import {
  readCategoriesFromExcel,
  writeCategoriesToExcel,
  type ExcelCategory,
} from "@/lib/local-excel-db";

export const runtime = "nodejs";

export function GET() {
  const categories = readCategoriesFromExcel();
  return NextResponse.json({ categories });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { categories?: ExcelCategory[] };
  const categories = body.categories ?? [];
  writeCategoriesToExcel(categories);
  return NextResponse.json({ categories });
}
