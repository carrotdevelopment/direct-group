DROP INDEX IF EXISTS "ClientProductCode_clientId_clientCode_active_key";

ALTER TABLE "ClientProductCode"
ADD COLUMN "changeReason" TEXT;

CREATE UNIQUE INDEX "ClientProductCode_clientId_clientCode_validFrom_key"
ON "ClientProductCode"("clientId", "clientCode", "validFrom");

CREATE INDEX "ClientProductCode_clientId_active_idx"
ON "ClientProductCode"("clientId", "active");

CREATE INDEX "ClientProductCode_clientId_productId_active_idx"
ON "ClientProductCode"("clientId", "productId", "active");
