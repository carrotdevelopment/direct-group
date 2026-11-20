import { checkApiAccess, clientForbidden, currentClientScope } from "@/server/lib/access";
import { filterByClientScope, inClientScope } from "@/lib/client-scope";
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
  const scope = await currentClientScope();
  const mappings = usesPostgres()
    ? await readClientCodesFromPostgres()
    : readClientCodesFromExcel();
  return NextResponse.json({ mappings: filterByClientScope(scope, mappings, (mapping) => mapping.client), source: usesPostgres() ? "postgresql" : "excel" });
}

export async function PUT(request: Request) {
  const denied = await checkApiAccess(["clientes"], true);
  if (denied) return denied;
  const body = (await request.json()) as {
    mappings?: ExcelClientCodeMapping[];
  };
  const incoming = body.mappings ?? [];
  const scope = await currentClientScope();
  if (incoming.some((mapping) => !inClientScope(scope, mapping.client))) return clientForbidden();
  // Guardar reemplaza toda la tabla: quien ve solo algunos clientes manda solo los suyos, así que se
  // conservan los de los demás.
  const keepOthers = async (read: () => ExcelClientCodeMapping[] | Promise<ExcelClientCodeMapping[]>) =>
    scope === null ? incoming : [...(await read()).filter((mapping) => !inClientScope(scope, mapping.client)), ...incoming];
  if (usesPostgres()) {
    const saved = await writeClientCodesToPostgres(await keepOthers(() => readClientCodesFromPostgres()));
    return NextResponse.json({ mappings: filterByClientScope(scope, saved, (mapping) => mapping.client), source: "postgresql" });
  }
  const all = await keepOthers(() => readClientCodesFromExcel());
  writeClientCodesToExcel(all);
  return NextResponse.json({ mappings: filterByClientScope(scope, all, (mapping) => mapping.client), source: "excel" });
}
