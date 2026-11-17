-- ID del pasaje en Urbano (N° de certificado, PAS2409PAMPA1). Se asigna la primera vez que el pasaje sale
-- en la planilla para Urbano y queda fijo: al volver a exportar sale el mismo y nunca se repite.
ALTER TABLE "pasaje_requests" ADD COLUMN "certificado_urbano" VARCHAR(40);

-- Los pasajes de lotes ya cargados reciben el ID con el que se exportaban hasta ahora: numerados por
-- cliente origen y fecha, en el orden de carga, sin los rechazados.
WITH base AS (
  SELECT p.id,
    CASE WHEN p.shipper_origen = '3102' THEN 'PJE' ELSE 'PAS' END
      || to_char(coalesce(b.fecha_solicitud, b.created_at::date), 'DDMM')
      || CASE c.plain WHEN 'CREDICOOP' THEN 'CREDI' WHEN 'MASSALIN' THEN 'MASS' WHEN 'PRODUCTECA' THEN 'PR' WHEN 'SYNGENTA' THEN 'SYN' ELSE c.plain END
      AS prefix,
    row_number() OVER (
      PARTITION BY lower(btrim(p.cliente_origen)), coalesce(b.fecha_solicitud, b.created_at::date)
      ORDER BY b.created_at, p.fila_origen NULLS LAST, p.created_at, p.id
    ) AS n
  FROM "pasaje_requests" p
  JOIN "pasaje_lotes" b ON b.id = p.lote_id
  CROSS JOIN LATERAL (
    SELECT upper(regexp_replace(translate(p.cliente_origen, 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU'), '[^A-Za-z0-9]', '', 'g')) AS plain
  ) c
  WHERE p.status <> 'rejected'
)
UPDATE "pasaje_requests" p SET "certificado_urbano" = base.prefix || base.n
FROM base WHERE base.id = p.id;

CREATE UNIQUE INDEX "pasaje_requests_certificado_urbano_key" ON "pasaje_requests"("certificado_urbano");
