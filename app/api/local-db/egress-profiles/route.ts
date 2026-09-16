import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { egressSchemas, type EgressClient } from "@/lib/operation-excel-db";
import {
  defaultEgressProfiles,
  saveEgressProfile,
  seedAndReadEgressProfiles,
  type EgressFieldMapping,
} from "@/lib/generic-egress-db";
import { usesPostgres } from "@/lib/data-source";

export const runtime = "nodejs";

function isClient(value: string): value is EgressClient {
  return Object.hasOwn(egressSchemas, value);
}

export async function GET() {
  const denied = await checkApiAccess(["ventas"], false);
  if (denied) return denied;
  return NextResponse.json({
    profiles: usesPostgres() ? await seedAndReadEgressProfiles() : defaultEgressProfiles(),
  });
}

export async function PUT(request: Request) {
  const denied = await checkApiAccess(["ventas"], true);
  if (denied) return denied;
  const body = (await request.json()) as {
    client?: string;
    columns?: string[];
    headerRow?: number;
    sheetName?: string;
    mapping?: EgressFieldMapping;
  };
  const client = body.client || "";
  if (!isClient(client) || !Array.isArray(body.columns) || !body.mapping) {
    return NextResponse.json({ ok: false, message: "La configuración de importación está incompleta." }, { status: 400 });
  }
  if (!usesPostgres()) {
    return NextResponse.json({ ok: false, message: "La configuración persistente requiere PostgreSQL." }, { status: 400 });
  }
  await saveEgressProfile({
    client,
    version: 1,
    active: true,
    sheetName: body.sheetName ?? "",
    headerRow: Math.max(1, Number(body.headerRow) || 1),
    columns: body.columns,
    mapping: body.mapping,
  });
  return NextResponse.json({ ok: true, message: `Configuración de ${client} guardada.` });
}
