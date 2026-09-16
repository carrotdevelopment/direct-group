import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { egressSchemas, parseEgressWorkbook, type EgressClient } from "@/lib/operation-excel-db";
import { validateUploadedFile } from "@/lib/upload-validation";
import { validateEgressScope, validDate, type EgressBulkScope } from "@/lib/egress-controls";
import {
  appendGenericEgressRecords, DuplicateEgressImportError, getGenericEgressSummary,
  readGenericEgressRows, softDeleteGenericEgresses, updateGenericEgress,
  readEgressBatches, previewEgressDeactivation, deactivateEgressScope,
} from "@/lib/generic-egress-db";

export const runtime = "nodejs";
const isClient = (value: string): value is EgressClient => Object.hasOwn(egressSchemas, value);
const bad = (message: string, status = 400) => NextResponse.json({ ok: false, message }, { status });
async function actorId() {
  const session = await auth();
  return session?.user?.id && session.user.role !== "LECTURA" ? session.user.id : null;
}
const unauthorized = () => bad("Iniciá sesión con permisos de edición para registrar quién realiza el cambio.", 401);

export async function GET(request: Request) {
  const denied = await checkApiAccess(["ventas"], false);
  if (denied) return denied;
  const url = new URL(request.url);
  const client = url.searchParams.get("client") || "";
  const from = url.searchParams.get("from") || undefined;
  const to = url.searchParams.get("to") || undefined;
  if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) return bad("Rango de fechas inválido.");
  if (url.searchParams.get("preview") === "1") {
    const scope = { batchId: url.searchParams.get("batchId") || undefined, from, to };
    if (!isClient(client) || !validateEgressScope(scope)) return bad("Elegí una subida o un rango de fechas completo.");
    return NextResponse.json({ count: await previewEgressDeactivation(client, scope) });
  }
  const requested = Number(url.searchParams.get("limit") || "1000");
  const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 5000) : 1000;
  return NextResponse.json({
    clients: Object.keys(egressSchemas), summary: await getGenericEgressSummary(),
    rows: await readGenericEgressRows({ client: isClient(client) ? client : undefined, from, to, limit }),
    batches: isClient(client) ? await readEgressBatches(client) : [], source: "postgresql",
  });
}

export async function POST(request: Request) {
  const denied = await checkApiAccess(["ventas"], true);
  if (denied) return denied;
  const actor = await actorId();
  if (!actor) return unauthorized();
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = await request.json() as {
        client?: string; records?: Record<string, unknown>[];
        source?: Parameters<typeof appendGenericEgressRecords>[2];
      };
      const client = body.client || "";
      if (!isClient(client) || !Array.isArray(body.records) || !body.records.length || body.records.some(row => !row || typeof row !== "object" || Array.isArray(row))) return bad("Cliente y registros de egreso son obligatorios.");
      const result = await appendGenericEgressRecords(client, body.records, body.source, actor);
      return NextResponse.json({ ok: true, ...result, source: "postgresql", message: `${result.insertedRows} egresos guardados.` });
    }
    const form = await request.formData();
    const client = String(form.get("client") || "");
    const file = form.get("file");
    if (!isClient(client) || !(file instanceof File)) return bad("Cliente y archivo son obligatorios.");
    const validation = validateUploadedFile(file, { allowedExtensions: ["xlsx", "xls", "xlsm"], label: "El archivo de egresos" });
    if (!validation.ok) return bad(validation.message);
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseEgressWorkbook(client, buffer);
    if (!parsed.ok) return NextResponse.json(parsed, { status: 400 });
    const result = await appendGenericEgressRecords(client, parsed.rows, {
      type: "FILE", fileName: file.name, fileHash: createHash("sha256").update(buffer).digest("hex"), headers: [...egressSchemas[client]],
    }, actor);
    return NextResponse.json({ ok: true, ...result, source: "postgresql", message: `${result.insertedRows} egresos cargados.` });
  } catch (error) {
    if (error instanceof DuplicateEgressImportError || (error && typeof error === "object" && "code" in error && error.code === "P2002")) return bad(error instanceof DuplicateEgressImportError ? error.message : "El archivo ya fue importado para este cliente.", 409);
    throw error;
  }
}

export async function PUT(request: Request) {
  const denied = await checkApiAccess(["ventas"], true);
  if (denied) return denied;
  const actor = await actorId();
  if (!actor) return unauthorized();
  const body = await request.json() as { client?: string; rowIndex?: number; values?: Record<string, unknown> };
  const client = body.client || "";
  if (!isClient(client) || !body.values || !Number.isSafeInteger(body.rowIndex) || Number(body.rowIndex) <= 0) return bad("Cliente, ID y valores válidos son obligatorios.");
  return await updateGenericEgress(Number(body.rowIndex), client, body.values, actor)
    ? NextResponse.json({ ok: true, message: "Egreso actualizado.", source: "postgresql" }) : bad("Egreso no encontrado.", 404);
}

export async function DELETE(request: Request) {
  const denied = await checkApiAccess(["ventas"], true);
  if (denied) return denied;
  const actor = await actorId();
  if (!actor) return unauthorized();
  const body = await request.json() as { client?: string; rowIndexes?: number[]; scope?: EgressBulkScope };
  const client = body.client || "";
  if (!isClient(client)) return bad("Cliente inválido.");
  if (body.scope && body.rowIndexes) return bad("Elegí filas o un alcance completo, no ambos.");
  let deletedRows: number;
  if (body.scope) {
    if (!validateEgressScope(body.scope)) return bad("Elegí una subida o un rango de fechas completo.");
    deletedRows = await deactivateEgressScope(client, body.scope, actor);
  } else {
    if (!Array.isArray(body.rowIndexes) || !body.rowIndexes.length || body.rowIndexes.some(id => !Number.isSafeInteger(id) || id <= 0)) return bad("IDs de egreso inválidos.");
    deletedRows = await softDeleteGenericEgresses(body.rowIndexes, client, actor);
  }
  return NextResponse.json({ ok: true, deletedRows, source: "postgresql", message: `${deletedRows} egresos inactivados. Se conservó el respaldo original.` });
}