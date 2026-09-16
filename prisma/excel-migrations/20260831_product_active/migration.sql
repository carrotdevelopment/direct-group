-- Preserve products for traceability by deactivating them instead of deleting.
ALTER TABLE "base_productos"
ADD COLUMN IF NOT EXISTS "activo" BOOLEAN NOT NULL DEFAULT true;
