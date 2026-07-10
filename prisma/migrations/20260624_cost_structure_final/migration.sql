DROP INDEX IF EXISTS "CostStructureRun_period_key";

ALTER TABLE "CostStructureRun"
ADD COLUMN "clientId" TEXT,
ADD COLUMN "insuranceRate" DECIMAL(7,4) NOT NULL DEFAULT 1.2,
ADD COLUMN "grossIncomeRate" DECIMAL(7,4) NOT NULL DEFAULT 5,
ADD COLUMN "debitTaxRate" DECIMAL(7,4) NOT NULL DEFAULT 0.6,
ADD COLUMN "creditTaxRate" DECIMAL(7,4) NOT NULL DEFAULT 0.6,
ADD COLUMN "missionsTaxRate" DECIMAL(7,4) NOT NULL DEFAULT 1.25;

CREATE UNIQUE INDEX "CostStructureRun_clientId_period_key"
ON "CostStructureRun"("clientId", "period");

CREATE INDEX "CostStructureRun_clientId_period_idx"
ON "CostStructureRun"("clientId", "period");

ALTER TABLE "CostStructureRun"
ADD CONSTRAINT "CostStructureRun_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CostStructureItem" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "productId" TEXT,
  "activeAtPeriod" BOOLEAN NOT NULL,
  "stockAtPeriod" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "itemDate" TIMESTAMP(3) NOT NULL,
  "clientCode" TEXT,
  "uniqueCode" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "supplierName" TEXT,
  "categoryName" TEXT,
  "publicPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "vatRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "markup" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "publicPriceNoVat" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "costDgNoVat" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "insurance" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "grossIncomeTax" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "debitTax" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "creditTax" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "freightNoVat" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "totalCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "netSalePrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "grossSalePrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "profit" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "profitPercentage" DECIMAL(7,4) NOT NULL DEFAULT 0,
  "missionsTax" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "costUpdated" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CostStructureItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CostStructureItem_runId_productId_key"
ON "CostStructureItem"("runId", "productId");

CREATE INDEX "CostStructureItem_runId_activeAtPeriod_idx"
ON "CostStructureItem"("runId", "activeAtPeriod");

CREATE INDEX "CostStructureItem_uniqueCode_idx"
ON "CostStructureItem"("uniqueCode");

ALTER TABLE "CostStructureItem"
ADD CONSTRAINT "CostStructureItem_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "CostStructureRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CostStructureItem"
ADD CONSTRAINT "CostStructureItem_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
