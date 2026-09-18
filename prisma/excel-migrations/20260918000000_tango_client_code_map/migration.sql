CREATE TABLE "tango_client_code_map" (
    "id" BIGSERIAL NOT NULL,
    "client_code" VARCHAR(255) NOT NULL,
    "client" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tango_client_code_map_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tango_client_code_map_client_code_key" ON "tango_client_code_map"("client_code");
