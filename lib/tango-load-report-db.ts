import "server-only";

import { excelPostgres } from "@/lib/excel-postgres-client";
import type { TangoLoadItem } from "@/lib/tango-load-report";

type Row = {
  kind: TangoLoadItem["kind"];
  at: Date;
  client: string | null;
  client_code: string | null;
  quantity: number | null;
  to_client: string | null;
  to_client_code: string | null;
  unique_code: string | null;
  product: string | null;
  detail: string | null;
  actor: string | null;
};

// Movimientos cargados o confirmados en la plataforma entre from (incluido) y to (excluido) que siguen
// marcados como pendientes de cargar en Tango. Lo migrado de las planillas y lo que vino de Tango no entra.
export async function readTangoLoadItems(from: Date, to: Date): Promise<TangoLoadItem[]> {
  const rows = await excelPostgres.$queryRaw<Row[]>`
    -- Pasajes confirmados cuyo ingreso en el destino no se encontró en Tango.
    SELECT 'pasaje' AS kind, p.confirmed_at AS at, p.cliente_origen AS client, p.codigo_cliente_origen AS client_code,
      p.cantidad_confirmada::float8 AS quantity, p.cliente_destino AS to_client, p.codigo_cliente_destino AS to_client_code,
      p.codigo_unico AS unique_code, p.producto AS product,
      nullif(concat_ws(' · ', CASE WHEN p.comprobante_urbano IS NOT NULL THEN 'Comprobante Urbano ' || p.comprobante_urbano END, p.comentarios), '') AS detail,
      p.confirmed_by AS actor
    FROM pasaje_requests p
    WHERE p.status = 'confirmed' AND p.confirmed_at >= ${from} AND p.confirmed_at < ${to} AND coalesce(p.cantidad_confirmada, 0) > 0
      AND EXISTS (SELECT 1 FROM tango_ingresos i WHERE i.pasaje_id = p.id AND i.external_key IS NULL AND i.pending_tango_entry)
    UNION ALL
    -- Ajustes que suman, devoluciones y pasajes registrados a mano en Ingresos.
    SELECT CASE i.operacion WHEN 'DEVOLUCION' THEN 'devolucion' WHEN 'PASAJE' THEN 'pasaje' ELSE 'ajusteSuma' END,
      i.created_at, CASE WHEN i.operacion = 'PASAJE' THEN i.origen_del_pasaje ELSE i.cliente END,
      CASE WHEN i.operacion = 'PASAJE' THEN '' ELSE i.codigo_cliente END,
      coalesce(i.cantidad, 0)::float8,
      CASE WHEN i.operacion = 'PASAJE' THEN i.cliente END, CASE WHEN i.operacion = 'PASAJE' THEN i.codigo_cliente END,
      NULL, NULL, i.comentarios, i.created_by
    FROM tango_ingresos i
    WHERE i.external_key IS NULL AND i.pasaje_id IS NULL AND i.pending_tango_entry
      AND i.operacion IN ('ROBO/AJUSTE', 'DEVOLUCION', 'PASAJE')
      AND coalesce(i.created_by, '') NOT LIKE 'migracion%'
      AND i.created_at >= ${from} AND i.created_at < ${to}
    UNION ALL
    -- Ajustes que restan (se guardan como egresos).
    SELECT 'ajusteResta', e.created_at, e.cliente, e.codigo_cliente, coalesce(e.cantidad, 0)::float8, NULL, NULL,
      e.codigo_unico, e.producto, e.comentarios, e.created_by
    FROM egresos e
    WHERE e.deleted_at IS NULL AND e.operacion = 'ROBO/AJUSTE' AND e.pasaje_id IS NULL
      AND e.raw_row_id IS NULL AND e.source_hash IS NULL
      AND coalesce(e.created_by, '') NOT LIKE 'migracion%'
      AND e.created_at >= ${from} AND e.created_at < ${to}`;
  return rows.map((row) => ({
    kind: row.kind,
    at: row.at,
    client: row.client ?? "",
    clientCode: row.client_code ?? "",
    quantity: Number(row.quantity ?? 0),
    toClient: row.to_client ?? undefined,
    toClientCode: row.to_client_code ?? undefined,
    uniqueCode: row.unique_code ?? undefined,
    product: row.product ?? undefined,
    detail: row.detail ?? undefined,
    by: row.actor ?? undefined,
  }));
}

// Hasta cuándo se reportó la última vez (fila propia en la tabla configuracion).
const LAST_REPORT_KEY = "reporteCargaTango";

export async function readLastTangoLoadReport() {
  const row = await excelPostgres.configSetting.findUnique({ where: { key: LAST_REPORT_KEY } });
  const value = row?.value as { until?: string } | null | undefined;
  const until = value?.until ? new Date(value.until) : null;
  return until && !Number.isNaN(until.getTime()) ? until : null;
}

export async function writeLastTangoLoadReport(until: Date) {
  const value = { until: until.toISOString() };
  await excelPostgres.configSetting.upsert({
    where: { key: LAST_REPORT_KEY },
    create: { key: LAST_REPORT_KEY, value, updatedBy: "reporte-carga-tango" },
    update: { value, updatedBy: "reporte-carga-tango" },
  });
}
