import { NextResponse } from "next/server";
import {
  readSuppliersFromExcel,
  writeSuppliersToExcel,
  type ExcelSupplier,
} from "@/lib/local-excel-db";

export const runtime = "nodejs";

export function GET() {
  const suppliers = readSuppliersFromExcel();
  return NextResponse.json({ suppliers });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { suppliers?: ExcelSupplier[] };
  const suppliers = body.suppliers ?? [];
  writeSuppliersToExcel(suppliers);
  return NextResponse.json({ suppliers });
}
