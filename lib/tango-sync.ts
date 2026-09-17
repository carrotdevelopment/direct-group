import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma, type TangoSyncJob } from "../node_modules/.prisma/excel-client";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { TANGO_MAX_ROWS, type TangoAgentRequest } from "@/lib/tango-sync-contract";

type Tx = Prisma.TransactionClient;
const LEASE_MS = 10 * 60 * 1000;
const active = ["pending", "running"];
export class TangoSyncError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export function connectorConfigured() {
  return (process.env.TANGO_CONNECTOR_TOKEN?.length ?? 0) >= 32;
}
export function validConnectorToken(header: string | null) {
  const expected = process.env.TANGO_CONNECTOR_TOKEN;
  if (!connectorConfigured() || !expected || !header?.startsWith("Bearer ")) return false;
  const received = Buffer.from(header.slice(7));
  const secret = Buffer.from(expected);
  return received.length === secret.length && timingSafeEqual(received, secret);
}
export function publicJob(job: TangoSyncJob | null) {
  if (!job) return null;
  return { id: job.id, from: job.dateFrom.toISOString().slice(0, 10),
    to: job.dateTo.toISOString().slice(0, 10), status: job.status,
    rowCount: job.rowCount, message: job.message, createdAt: job.createdAt,
    finishedAt: job.finishedAt, attempts: job.attempts };
}
// All queue mutations share this transaction lock, including cancellation and publication.
// This prevents two serverless invocations from claiming/publishing overlapping jobs.
async function locked<T>(fn: (tx: Tx) => Promise<T>) {
  return excelPostgres.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(734901627)`;
    return fn(tx);
  }, { maxWait: 5000, timeout: 25000 });
}
export async function syncStatus() {
  const [job, connector] = await Promise.all([
    excelPostgres.tangoSyncJob.findFirst({ orderBy: { createdAt: "desc" } }),
    excelPostgres.tangoConnectorState.findUnique({ where: { id: "default" } }),
  ]);
  return { configured: connectorConfigured(), job: publicJob(job), lastSeenAt: connector?.lastSeenAt ?? null };
}
export async function requestSync(from: string, to: string, requestedBy: string) {
  if (!connectorConfigured()) throw new TangoSyncError("Falta configurar el conector de Tango.", 503);
  return locked(async (tx) => {
    const existing = await tx.tangoSyncJob.findFirst({ where: { status: { in: active } } });
    if (existing) {
      if (existing.dateFrom.toISOString().slice(0, 10) === from && existing.dateTo.toISOString().slice(0, 10) === to) return publicJob(existing);
      throw new TangoSyncError("Ya hay una importación pendiente. Esperá a que termine o cancelala.");
    }
    return publicJob(await tx.tangoSyncJob.create({ data: {
      dateFrom: new Date(from), dateTo: new Date(to), requestedBy,
    } }));
  });
}
export async function cancelSync(id: string) {
  return locked(async (tx) => {
    const result = await tx.tangoSyncJob.updateMany({ where: { id, status: { in: active } }, data: {
      status: "cancelled", finishedAt: new Date(), leaseUntil: null, claimToken: null,
      message: "Importación cancelada. Los datos anteriores se conservaron.",
    } });
    if (result.count) await tx.tangoSyncBatch.deleteMany({ where: { jobId: id } });
    return { ok: true };
  });
}

async function publish(tx: Tx, job: TangoSyncJob) {
  // A temporary table keeps the entire publication on one connection and makes it atomic.
  await tx.$executeRaw`CREATE TEMP TABLE tango_sync_incoming ON COMMIT DROP AS
    SELECT 'Direct_Group:STA20:' || (r->>'sourceId') AS external_key,
      r->>'headerId' AS source_header_id,
      r->>'client' AS cliente, r->>'operation' AS operacion,
      (r->>'orderDate')::date AS fecha_pedido, r->>'purchaseOrder' AS orden_de_compra,
      r->>'clientCode' AS codigo_cliente, (r->>'quantity')::numeric(18,4) AS cantidad,
      (r->>'deliveryDate')::date AS fecha_entrega,
      (r->>'deliveredQuantity')::numeric(18,4) AS entregado, r->>'comments' AS comentarios
    FROM tango_sync_batches b CROSS JOIN LATERAL jsonb_array_elements(b.rows) r
    WHERE b.job_id = ${job.id}::uuid`;
  const duplicate = await tx.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM
    (SELECT external_key FROM tango_sync_incoming GROUP BY external_key HAVING count(*) > 1) d`;
  if (Number(duplicate[0].count)) throw new TangoSyncError("La consulta devolvió IDs de Tango repetidos. Revisá las uniones de depósitos y órdenes.");

  // Adopt exact legacy Excel rows one-to-one, preserving transfer origins and provenance.
  // JSON tuples avoid hash collisions; ordinal matching preserves legitimate identical lines.
  const signature = Prisma.sql`jsonb_build_array(
    trim(coalesce(cliente,'')), trim(coalesce(operacion,'')), fecha_pedido,
    trim(coalesce(orden_de_compra,'')), trim(coalesce(codigo_cliente,'')),
    cantidad, fecha_entrega, entregado, trim(coalesce(comentarios,'')))`;
  await tx.$executeRaw`WITH incoming_keys AS (
      SELECT i.*, ${signature} AS signature FROM tango_sync_incoming i
      WHERE NOT EXISTS (SELECT 1 FROM tango_ingresos t WHERE t.external_key = i.external_key)
    ), incoming AS (
      SELECT *, row_number() OVER (PARTITION BY signature ORDER BY external_key) AS ordinal FROM incoming_keys
    ), legacy_keys AS (
      SELECT id, ${signature} AS signature FROM tango_ingresos
      WHERE external_key IS NULL AND pending_tango_entry = false
        AND fecha_entrega BETWEEN ${job.dateFrom}::date AND ${job.dateTo}::date
    ), legacy AS (
      SELECT *, row_number() OVER (PARTITION BY signature ORDER BY id) AS ordinal FROM legacy_keys
    ) UPDATE tango_ingresos t SET external_key = i.external_key, source_header_id = i.source_header_id
      FROM incoming i JOIN legacy l ON l.signature = i.signature AND l.ordinal = i.ordinal
      WHERE t.id = l.id`;
  const remaining = await tx.tangoIncome.count({ where: {
    externalKey: null, pendingTangoEntry: false, deliveryDate: { gte: job.dateFrom, lte: job.dateTo },
  } });
  if (remaining) throw new TangoSyncError(`Hay ${remaining} ingresos anteriores sin ID de Tango que no coinciden con la consulta. Hay que conciliarlos antes de importar este período para evitar duplicados.`);

  await tx.$executeRaw`INSERT INTO tango_ingresos
    (external_key, source_header_id, cliente, operacion, fecha_pedido, orden_de_compra,
     codigo_cliente, cantidad, fecha_entrega, entregado, comentarios, created_at, updated_at)
    SELECT external_key, source_header_id, cliente, operacion, fecha_pedido, orden_de_compra,
      codigo_cliente, cantidad, fecha_entrega, entregado, comentarios, now(), now()
    FROM tango_sync_incoming
    ON CONFLICT (external_key) DO UPDATE SET
      source_header_id = EXCLUDED.source_header_id, cliente = EXCLUDED.cliente,
      operacion = EXCLUDED.operacion, fecha_pedido = EXCLUDED.fecha_pedido,
      orden_de_compra = EXCLUDED.orden_de_compra, codigo_cliente = EXCLUDED.codigo_cliente,
      cantidad = EXCLUDED.cantidad, fecha_entrega = EXCLUDED.fecha_entrega,
      entregado = EXCLUDED.entregado, comentarios = EXCLUDED.comentarios, updated_at = now()`;
}

export async function handleAgent(input: TangoAgentRequest) {
  return locked(async (tx) => {
    const now = new Date();
    await tx.tangoConnectorState.upsert({ where: { id: "default" },
      create: { id: "default", lastSeenAt: now }, update: { lastSeenAt: now } });
    if (input.action === "claim") {
      const job = await tx.tangoSyncJob.findFirst({ where: { status: { in: active } }, orderBy: { createdAt: "asc" } });
      if (!job || (job.status === "running" && job.leaseUntil && job.leaseUntil > now)) return { job: null };
      if (job.attempts >= 3) {
        await tx.tangoSyncJob.update({ where: { id: job.id }, data: {
          status: "failed", finishedAt: now, leaseUntil: null, claimToken: null,
          message: "El conector no pudo completar la importación después de tres intentos. Podés volver a solicitarla.",
        } });
        await tx.tangoSyncBatch.deleteMany({ where: { jobId: job.id } });
        return { job: null };
      }
      const claimed = await tx.tangoSyncJob.update({ where: { id: job.id }, data: {
        status: "running", attempts: { increment: 1 }, claimToken: randomUUID(),
        leaseUntil: new Date(now.getTime() + LEASE_MS), rowCount: 0, message: null,
      } });
      await tx.tangoSyncBatch.deleteMany({ where: { jobId: job.id } });
      return { job: { ...publicJob(claimed), claimToken: claimed.claimToken } };
    }
    const job = await tx.tangoSyncJob.findUnique({ where: { id: input.jobId } });
    if (!job || job.claimToken !== input.claimToken) throw new TangoSyncError("La solicitud ya no pertenece a este intento.");
    // A lost HTTP response must not turn a successful publication into a failure.
    if (job.status === "completed" && (input.action === "finish" || input.action === "fail")) return { ok: true };
    if (job.status !== "running" || !job.leaseUntil || job.leaseUntil <= now) throw new TangoSyncError("El intento venció o fue cancelado.");
    if (input.action === "fail") {
      const messages = {
        SQL_CONNECTION: "No se pudo conectar con SQL Server. Revisá la configuración del conector.",
        SQL_QUERY: "No se pudo ejecutar la consulta de Tango. Revisá los permisos y las tablas.",
        TOO_MANY_ROWS: "El período supera los 20.000 renglones. Elegí un rango de fechas menor.",
        INVALID_RESULT: "Tango devolvió datos que no cumplen el formato esperado.",
        TRANSFER_FAILED: "No se pudo completar la transferencia. Podés volver a solicitarla.",
      };
      await tx.tangoSyncJob.update({ where: { id: job.id }, data: {
        status: "failed", finishedAt: now, leaseUntil: null, message: messages[input.code],
      } });
      await tx.tangoSyncBatch.deleteMany({ where: { jobId: job.id } });
      return { ok: true };
    }
    if (input.action === "batch") {
      const from = job.dateFrom.toISOString().slice(0, 10), to = job.dateTo.toISOString().slice(0, 10);
      if (input.rows.some((r) => r.deliveryDate < from || r.deliveryDate > to)) throw new TangoSyncError("Un renglón está fuera del período solicitado.", 400);
      const existing = await tx.tangoSyncBatch.findUnique({ where: { jobId_index: { jobId: job.id, index: input.index } } });
      if (existing && JSON.stringify(existing.rows) !== JSON.stringify(input.rows)) {
        // JSONB property ordering is not stable: compare through PostgreSQL instead.
        const equal = await tx.$queryRaw<{ equal: boolean }[]>`SELECT rows = ${JSON.stringify(input.rows)}::jsonb AS equal
          FROM tango_sync_batches WHERE job_id = ${job.id}::uuid AND index = ${input.index}`;
        if (!equal[0]?.equal) throw new TangoSyncError("El lote ya existe con otro contenido.");
      }
      if (!existing) {
        if (job.rowCount + input.rows.length > TANGO_MAX_ROWS) throw new TangoSyncError("Se superó el límite de renglones.", 400);
        await tx.tangoSyncBatch.create({ data: { jobId: job.id, index: input.index, rows: input.rows } });
      }
      await tx.tangoSyncJob.update({ where: { id: job.id }, data: {
        rowCount: { increment: existing ? 0 : input.rows.length }, leaseUntil: new Date(now.getTime() + LEASE_MS),
      } });
      return { ok: true };
    }
    const batches = await tx.tangoSyncBatch.findMany({ where: { jobId: job.id }, select: { index: true }, orderBy: { index: "asc" } });
    if (job.rowCount !== input.totalRows || batches.length !== input.totalBatches || batches.some((b, i) => b.index !== i)) {
      throw new TangoSyncError("Faltan lotes o no coincide el total recibido.");
    }
    await publish(tx, job);
    await tx.tangoSyncJob.update({ where: { id: job.id }, data: {
      status: "completed", finishedAt: now, leaseUntil: null,
      message: `${job.rowCount} renglones importados.`,
    } });
    // Successful batches are retained as the raw audit of the last received payloads.
    return { ok: true };
  });
}
