-- Respuesta de cada proveedor al pedido mensual de precios y última reconsulta enviada.
ALTER TABLE "supplier_mail_contacts"
    ADD COLUMN "respondido_at" TIMESTAMPTZ(6),
    ADD COLUMN "respuesta_con_adjunto" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "respuestas_revisadas_at" TIMESTAMPTZ(6),
    ADD COLUMN "ultima_reconsulta_at" TIMESTAMPTZ(6);
