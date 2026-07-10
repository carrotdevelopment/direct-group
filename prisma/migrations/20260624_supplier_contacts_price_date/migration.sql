ALTER TABLE "SupplierPriceRequestConfig"
ADD COLUMN "contactName" TEXT;

ALTER TABLE "SupplierPrice"
ADD COLUMN "informedAt" TIMESTAMP(3);

CREATE INDEX "SupplierPrice_informedAt_idx"
ON "SupplierPrice"("informedAt");
