CREATE TABLE "pasaje_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente_origen" VARCHAR(255) NOT NULL,
    "codigo_cliente_origen" VARCHAR(255) NOT NULL,
    "cliente_destino" VARCHAR(255) NOT NULL,
    "codigo_cliente_destino" VARCHAR(255) NOT NULL,
    "codigo_unico" VARCHAR(255) NOT NULL,
    "producto" VARCHAR(255),
    "cantidad" DECIMAL(18,4) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "comentarios" TEXT,
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "responded_by" VARCHAR(255),
    "responded_at" TIMESTAMPTZ(6),
    "response_comment" TEXT,

    CONSTRAINT "pasaje_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pasaje_requests_status_idx" ON "pasaje_requests"("status");

CREATE TABLE "ajuste_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cliente" VARCHAR(255) NOT NULL,
    "codigo_cliente" VARCHAR(255) NOT NULL,
    "codigo_unico" VARCHAR(255) NOT NULL,
    "producto" VARCHAR(255),
    "cantidad" DECIMAL(18,4) NOT NULL,
    "motivo" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_by" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "responded_by" VARCHAR(255),
    "responded_at" TIMESTAMPTZ(6),
    "response_comment" TEXT,

    CONSTRAINT "ajuste_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ajuste_requests_status_idx" ON "ajuste_requests"("status");
