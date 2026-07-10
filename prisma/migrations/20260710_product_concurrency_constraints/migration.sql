-- Product/master-data guardrails for the PostgreSQL implementation.
-- These constraints make the database the final arbiter when multiple users
-- create or edit records concurrently.

-- Required text fields must not be blank after trimming.
ALTER TABLE "Product"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_internalCode_not_blank_chk"
  CHECK (length(btrim("internalCode")) > 0);

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_name_not_blank_chk"
  CHECK (length(btrim("name")) > 0);

ALTER TABLE "Brand"
  ADD CONSTRAINT "Brand_name_not_blank_chk"
  CHECK (length(btrim("name")) > 0);

ALTER TABLE "Category"
  ADD CONSTRAINT "Category_name_not_blank_chk"
  CHECK (length(btrim("name")) > 0);

ALTER TABLE "Supplier"
  ADD CONSTRAINT "Supplier_code_not_blank_chk"
  CHECK (length(btrim("code")) > 0);

ALTER TABLE "Supplier"
  ADD CONSTRAINT "Supplier_name_not_blank_chk"
  CHECK (length(btrim("name")) > 0);

ALTER TABLE "Client"
  ADD CONSTRAINT "Client_code_not_blank_chk"
  CHECK (length(btrim("code")) > 0);

ALTER TABLE "Client"
  ADD CONSTRAINT "Client_name_not_blank_chk"
  CHECK (length(btrim("name")) > 0);

ALTER TABLE "ClientProductCode"
  ADD CONSTRAINT "ClientProductCode_clientCode_not_blank_chk"
  CHECK (length(btrim("clientCode")) > 0);

-- Numeric sanity checks. Quantities are stored as positive numbers; direction
-- or operation type expresses whether they add or subtract stock.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_unitsPerPackage_positive_chk"
  CHECK ("unitsPerPackage" IS NULL OR "unitsPerPackage" > 0);

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_version_positive_chk"
  CHECK ("version" > 0);

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_quantity_positive_chk"
  CHECK ("quantity" > 0);

ALTER TABLE "Purchase"
  ADD CONSTRAINT "Purchase_quantity_positive_chk"
  CHECK ("quantity" > 0);

ALTER TABLE "Sale"
  ADD CONSTRAINT "Sale_quantity_positive_chk"
  CHECK ("quantity" > 0);

ALTER TABLE "SupplierPrice"
  ADD CONSTRAINT "SupplierPrice_amounts_valid_chk"
  CHECK (
    "cost" >= 0
    AND "vatRate" >= 0
    AND "vatRate" <= 100
    AND ("publicCost" IS NULL OR "publicCost" >= 0)
    AND ("markup" IS NULL OR "markup" >= -100)
  );

ALTER TABLE "ClientPricing"
  ADD CONSTRAINT "ClientPricing_amounts_valid_chk"
  CHECK (
    "cost" >= 0
    AND "vatRate" >= 0
    AND "vatRate" <= 100
    AND ("publicCost" IS NULL OR "publicCost" >= 0)
    AND "markup" >= -100
    AND "insurance" >= 0
    AND "grossIncomeTax" >= 0
    AND "debitCreditTax" >= 0
    AND "freight" >= 0
    AND "totalCost" >= 0
    AND "netSalePrice" >= 0
    AND "grossSalePrice" >= 0
  );

ALTER TABLE "ClientProductCode"
  ADD CONSTRAINT "ClientProductCode_valid_period_chk"
  CHECK ("validUntil" IS NULL OR "validUntil" > "validFrom");

-- Case/space-insensitive uniqueness. These indexes prevent concurrent users
-- from creating semantically duplicated master data with different casing.
CREATE UNIQUE INDEX IF NOT EXISTS "Product_internalCode_normalized_key"
ON "Product" (lower(btrim("internalCode")));

CREATE UNIQUE INDEX IF NOT EXISTS "Brand_name_normalized_key"
ON "Brand" (lower(btrim("name")));

CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_normalized_key"
ON "Category" (lower(btrim("name")));

CREATE UNIQUE INDEX IF NOT EXISTS "Supplier_code_normalized_key"
ON "Supplier" (lower(btrim("code")));

CREATE UNIQUE INDEX IF NOT EXISTS "Client_code_normalized_key"
ON "Client" (lower(btrim("code")));

-- A supplier cannot have two active/catalog products with the same supplier
-- code. Archived records are excluded so historical cleanup does not block a
-- controlled future replacement.
CREATE UNIQUE INDEX IF NOT EXISTS "Product_supplier_supplierCode_active_key"
ON "Product" ("primarySupplierId", lower(btrim("supplierCode")))
WHERE
  "primarySupplierId" IS NOT NULL
  AND "supplierCode" IS NOT NULL
  AND length(btrim("supplierCode")) > 0
  AND "status" <> 'ARCHIVED';

-- A client code can point to only one active product at a time for the same
-- client. Historical rows remain supported through validFrom/validUntil.
CREATE UNIQUE INDEX IF NOT EXISTS "ClientProductCode_client_activeCode_key"
ON "ClientProductCode" ("clientId", lower(btrim("clientCode")))
WHERE "active" = true;

-- Fast lookup paths used by import/matching flows.
CREATE INDEX IF NOT EXISTS "Product_supplierCode_normalized_idx"
ON "Product" (lower(btrim("supplierCode")))
WHERE "supplierCode" IS NOT NULL AND length(btrim("supplierCode")) > 0;

CREATE INDEX IF NOT EXISTS "ClientProductCode_clientCode_normalized_idx"
ON "ClientProductCode" (lower(btrim("clientCode")));
