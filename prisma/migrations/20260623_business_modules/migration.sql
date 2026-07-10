ALTER TYPE "ImportType" ADD VALUE 'CLIENT_EGRESS';
ALTER TYPE "ImportType" ADD VALUE 'INCOME_FOLDER';

CREATE TYPE "PriceRequestStatus" AS ENUM ('SCHEDULED', 'SENT', 'RECEIVED', 'PROCESSING', 'WAITING_REVIEW', 'COMPLETED', 'NO_RESPONSE', 'FAILED');

CREATE TABLE "SupplierPriceRequestConfig" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "recipientEmails" TEXT[],
  "ccEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "brandNames" TEXT[],
  "scheduleDay" INTEGER NOT NULL DEFAULT 1,
  "scheduleTime" TEXT NOT NULL DEFAULT '09:00',
  "subjectTemplate" TEXT NOT NULL,
  "bodyTemplate" TEXT NOT NULL,
  "reminderDays" INTEGER NOT NULL DEFAULT 4,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastSentAt" TIMESTAMP(3),
  "nextRunAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierPriceRequestConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierPriceRequestCycle" (
  "id" TEXT NOT NULL,
  "configId" TEXT NOT NULL,
  "period" TIMESTAMP(3) NOT NULL,
  "status" "PriceRequestStatus" NOT NULL DEFAULT 'SCHEDULED',
  "sentAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "externalMessageId" TEXT,
  "replyMessageId" TEXT,
  "processingNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierPriceRequestCycle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientEgressMapping" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "filePattern" TEXT,
  "sheetName" TEXT,
  "headerRow" INTEGER NOT NULL DEFAULT 1,
  "fieldMapping" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientEgressMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IncomeSource" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "folderPath" TEXT NOT NULL,
  "filePattern" TEXT NOT NULL DEFAULT '*.xlsx',
  "pollingMinutes" INTEGER NOT NULL DEFAULT 30,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastScannedAt" TIMESTAMP(3),
  "lastFileName" TEXT,
  "lastFileHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IncomeSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CostStructureRun" (
  "id" TEXT NOT NULL,
  "period" TIMESTAMP(3) NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
  "activeProducts" INTEGER NOT NULL DEFAULT 0,
  "calculatedItems" INTEGER NOT NULL DEFAULT 0,
  "pendingItems" INTEGER NOT NULL DEFAULT 0,
  "assumptions" JSONB,
  "generatedBy" TEXT,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "CostStructureRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierPriceRequestConfig_active_nextRunAt_idx" ON "SupplierPriceRequestConfig"("active", "nextRunAt");
CREATE INDEX "SupplierPriceRequestConfig_supplierId_idx" ON "SupplierPriceRequestConfig"("supplierId");
CREATE UNIQUE INDEX "SupplierPriceRequestCycle_configId_period_key" ON "SupplierPriceRequestCycle"("configId", "period");
CREATE INDEX "SupplierPriceRequestCycle_status_period_idx" ON "SupplierPriceRequestCycle"("status", "period");
CREATE UNIQUE INDEX "ClientEgressMapping_clientId_name_key" ON "ClientEgressMapping"("clientId", "name");
CREATE INDEX "ClientEgressMapping_clientId_active_idx" ON "ClientEgressMapping"("clientId", "active");
CREATE INDEX "IncomeSource_active_lastScannedAt_idx" ON "IncomeSource"("active", "lastScannedAt");
CREATE UNIQUE INDEX "CostStructureRun_period_key" ON "CostStructureRun"("period");
CREATE INDEX "CostStructureRun_status_generatedAt_idx" ON "CostStructureRun"("status", "generatedAt");

ALTER TABLE "SupplierPriceRequestConfig" ADD CONSTRAINT "SupplierPriceRequestConfig_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierPriceRequestCycle" ADD CONSTRAINT "SupplierPriceRequestCycle_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SupplierPriceRequestConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientEgressMapping" ADD CONSTRAINT "ClientEgressMapping_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
