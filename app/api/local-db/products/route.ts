import { NextResponse } from "next/server";
import {
  readProductsFromExcel,
  writeProductsToExcel,
  type ExcelProduct,
} from "@/lib/local-excel-db";

export const runtime = "nodejs";

export function GET() {
  const products = readProductsFromExcel();
  return NextResponse.json({ products });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { products?: ExcelProduct[] };
  const products = body.products ?? [];
  writeProductsToExcel(products);
  return NextResponse.json({ products });
}
