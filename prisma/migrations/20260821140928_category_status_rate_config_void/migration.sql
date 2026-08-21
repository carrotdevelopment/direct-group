-- DropForeignKey
ALTER TABLE "SupplierPriceRequestCycle" DROP CONSTRAINT "SupplierPriceRequestCycle_configId_fkey";

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "ClientRateConfig" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "value" DECIMAL(7,4) NOT NULL,
    "appliesTo" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientRateConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientRateConfig_clientId_validFrom_idx" ON "ClientRateConfig"("clientId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ClientRateConfig_clientId_key_validFrom_key" ON "ClientRateConfig"("clientId", "key", "validFrom");

-- AddForeignKey
ALTER TABLE "ClientRateConfig" ADD CONSTRAINT "ClientRateConfig_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierPriceRequestCycle" ADD CONSTRAINT "SupplierPriceRequestCycle_configId_fkey" FOREIGN KEY ("configId") REFERENCES "SupplierPriceRequestConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
