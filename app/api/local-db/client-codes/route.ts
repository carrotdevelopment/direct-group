import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import {
  readClientCodesFromExcel,
  writeClientCodesToExcel,
  type ExcelClientCodeMapping,
} from "@/lib/local-excel-db";
import { usesPostgres } from "@/lib/data-source";
import {
  readClientCodesFromPostgres,
  writeClientCodesToPostgres,
} from "@/lib/postgres-replica-db";

export const runtime = "nodejs";

export async function GET() {
  const denied = await checkApiAccess(["clientes"], false);
  if (denied) return denied;
  const mappings = usesPostgres()
    ? await readClientCodesFromPostgres()
    : readClientCodesFromExcel();
  return NextResponse.json({ mappings, source: usesPostgres() ? "postgresql" : "excel" });
}

export async function PUT(request: Request) {
  const denied = await checkApiAccess(["clientes"], true);
  if (denied) return denied;
  const body = (await request.json()) as {
    mappings?: ExcelClientCodeMapping[];
  };
  const mappings = body.mappings ?? [];
  if (usesPostgres()) {
    const saved = await writeClientCodesToPostgres(mappings);
    return NextResponse.json({ mappings: saved, source: "postgresql" });
  }
  writeClientCodesToExcel(mappings);
  return NextResponse.json({ mappings, source: "excel" });
}
