import { NextResponse } from "next/server";
import {
  readClientCodesFromExcel,
  writeClientCodesToExcel,
  type ExcelClientCodeMapping,
} from "@/lib/local-excel-db";

export const runtime = "nodejs";

export function GET() {
  const mappings = readClientCodesFromExcel();
  return NextResponse.json({ mappings });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    mappings?: ExcelClientCodeMapping[];
  };
  const mappings = body.mappings ?? [];
  writeClientCodesToExcel(mappings);
  return NextResponse.json({ mappings });
}
