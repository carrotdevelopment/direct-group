-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'VENDEDOR', 'DEPOSITO', 'LECTURA');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MovementDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE_IN', 'SALE_OUT', 'TRANSFER_OUT', 'TRANSFER_IN', 'MANUAL_ADJUSTMENT_IN', 'MANUAL_ADJUSTMENT_OUT', 'RETURN_IN', 'RETURN_OUT', 'RESERVATION', 'RELEASE_RESERVATION');

-- CreateEnum
CREATE TYPE "ImportType" AS ENUM ('CLIENT_SALES', 'SUPPLIER_PRICES', 'TANGO_PURCHASES', 'OTHER');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'WAITING_USER_MAPPING', 'VALIDATING', 'WAITING_CONFIRMATION', 'CONFIRMED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'ACTIVE', 'WAITING_USER_INPUT', 'COMPLETED', 'FAILED', 'RETRYING', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REVERSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'LECTURA',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "taxId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "taxId" TEXT,
    "segment" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "internalCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "brandId" TEXT,
    "categoryId" TEXT,
    "primarySupplierId" TEXT,
    "unitsPerPackage" INTEGER,
    "supplierCode" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientProductCode" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "clientCode" TEXT NOT NULL,
    "clientDescription" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientProductCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierCode" TEXT,
    "cost" DECIMAL(18,4) NOT NULL,
    "vatRate" DECIMAL(7,4) NOT NULL,
    "publicCost" DECIMAL(18,4),
    "markup" DECIMAL(7,4),
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "sourceFileId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPricing" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierPriceId" TEXT,
    "cost" DECIMAL(18,4) NOT NULL,
    "vatRate" DECIMAL(7,4) NOT NULL,
    "publicCost" DECIMAL(18,4),
    "markup" DECIMAL(7,4) NOT NULL,
    "insurance" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "grossIncomeTax" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "debitCreditTax" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "freight" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(18,4) NOT NULL,
    "netSalePrice" DECIMAL(18,4) NOT NULL,
    "grossSalePrice" DECIMAL(18,4) NOT NULL,
    "profit" DECIMAL(18,4) NOT NULL,
    "profitPercentage" DECIMAL(7,4) NOT NULL,
    "missionsTax" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "volumetricWeight" DECIMAL(18,4),
    "packages" INTEGER,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stockClientId" TEXT,
    "originClientId" TEXT,
    "destinationClientId" TEXT,
    "warehouseId" TEXT,
    "type" "StockMovementType" NOT NULL,
    "direction" "MovementDirection" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "transferId" TEXT,
    "comments" TEXT,
    "metadata" JSONB,
    "idempotencyKey" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "clientCodeId" TEXT,
    "operation" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "deliveryDate" TIMESTAMP(3),
    "purchaseOrder" TEXT,
    "externalCode" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "transferOrigin" TEXT,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "comments" TEXT,
    "tangoExternalId" TEXT,
    "importBatchId" TEXT,
    "status" "OperationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "clientCodeId" TEXT,
    "saleDate" TIMESTAMP(3) NOT NULL,
    "externalCode" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4),
    "totalAmount" DECIMAL(18,4),
    "sourceFileId" TEXT,
    "importBatchId" TEXT,
    "sourceRow" INTEGER,
    "status" "OperationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedFile" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "clientId" TEXT,
    "supplierId" TEXT,
    "importType" "ImportType" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "aiResult" JSONB,
    "errors" JSONB,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "type" "ImportType" NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "mapping" JSONB,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRawRow" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "normalizedData" JSONB,
    "validationErrors" JSONB,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRawRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "bullmqJobId" TEXT,
    "fileId" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiExtraction" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "extractionType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputSample" JSONB,
    "output" JSONB NOT NULL,
    "confidenceScore" DECIMAL(7,6),
    "status" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_taxId_key" ON "Supplier"("taxId");

-- CreateIndex
CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Client_taxId_key" ON "Client"("taxId");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_internalCode_key" ON "Product"("internalCode");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Product_supplierCode_idx" ON "Product"("supplierCode");

-- CreateIndex
CREATE INDEX "Product_brandId_idx" ON "Product"("brandId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "ClientProductCode_productId_idx" ON "ClientProductCode"("productId");

-- CreateIndex
CREATE INDEX "ClientProductCode_clientCode_idx" ON "ClientProductCode"("clientCode");

-- CreateIndex
CREATE UNIQUE INDEX "ClientProductCode_clientId_clientCode_active_key" ON "ClientProductCode"("clientId", "clientCode", "active");

-- CreateIndex
CREATE INDEX "SupplierPrice_supplierId_validFrom_idx" ON "SupplierPrice"("supplierId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierPrice_productId_supplierId_validFrom_key" ON "SupplierPrice"("productId", "supplierId", "validFrom");

-- CreateIndex
CREATE INDEX "ClientPricing_clientId_validUntil_idx" ON "ClientPricing"("clientId", "validUntil");

-- CreateIndex
CREATE INDEX "ClientPricing_productId_idx" ON "ClientPricing"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPricing_clientId_productId_validFrom_key" ON "ClientPricing"("clientId", "productId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_idempotencyKey_key" ON "StockMovement"("idempotencyKey");

-- CreateIndex
CREATE INDEX "StockMovement_productId_stockClientId_warehouseId_idx" ON "StockMovement"("productId", "stockClientId", "warehouseId");

-- CreateIndex
CREATE INDEX "StockMovement_referenceType_referenceId_idx" ON "StockMovement"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "StockMovement_transferId_idx" ON "StockMovement"("transferId");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_tangoExternalId_key" ON "Purchase"("tangoExternalId");

-- CreateIndex
CREATE INDEX "Purchase_clientId_orderDate_idx" ON "Purchase"("clientId", "orderDate");

-- CreateIndex
CREATE INDEX "Purchase_productId_idx" ON "Purchase"("productId");

-- CreateIndex
CREATE INDEX "Sale_clientId_saleDate_idx" ON "Sale"("clientId", "saleDate");

-- CreateIndex
CREATE INDEX "Sale_productId_idx" ON "Sale"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_importBatchId_sourceRow_key" ON "Sale"("importBatchId", "sourceRow");

-- CreateIndex
CREATE UNIQUE INDEX "UploadedFile_storageName_key" ON "UploadedFile"("storageName");

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_idempotencyKey_key" ON "ImportBatch"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRawRow_importBatchId_rowNumber_key" ON "ImportRawRow"("importBatchId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingJob_bullmqJobId_key" ON "ProcessingJob"("bullmqJobId");

-- CreateIndex
CREATE INDEX "AiExtraction_fileId_extractionType_idx" ON "AiExtraction"("fileId", "extractionType");

-- CreateIndex
CREATE INDEX "AuditLog_entity_recordId_idx" ON "AuditLog"("entity", "recordId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_primarySupplierId_fkey" FOREIGN KEY ("primarySupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientProductCode" ADD CONSTRAINT "ClientProductCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientProductCode" ADD CONSTRAINT "ClientProductCode_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPrice" ADD CONSTRAINT "SupplierPrice_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPricing" ADD CONSTRAINT "ClientPricing_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPricing" ADD CONSTRAINT "ClientPricing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPricing" ADD CONSTRAINT "ClientPricing_supplierPriceId_fkey" FOREIGN KEY ("supplierPriceId") REFERENCES "SupplierPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockClientId_fkey" FOREIGN KEY ("stockClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_originClientId_fkey" FOREIGN KEY ("originClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_destinationClientId_fkey" FOREIGN KEY ("destinationClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_clientCodeId_fkey" FOREIGN KEY ("clientCodeId") REFERENCES "ClientProductCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_clientCodeId_fkey" FOREIGN KEY ("clientCodeId") REFERENCES "ClientProductCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UploadedFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRawRow" ADD CONSTRAINT "ImportRawRow_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UploadedFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiExtraction" ADD CONSTRAINT "AiExtraction_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "UploadedFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
