CREATE TABLE "supplier_mail_contacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "supplier" VARCHAR(255) NOT NULL,
  "contacto" VARCHAR(255) NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "last_sent_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_mail_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_mail_logs" (
  "id" BIGSERIAL NOT NULL,
  "contact_id" UUID NOT NULL,
  "period" VARCHAR(7) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "trigger" VARCHAR(20) NOT NULL,
  "error" TEXT,
  "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_mail_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "supplier_mail_logs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "supplier_mail_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "supplier_mail_logs_contact_id_period_idx" ON "supplier_mail_logs"("contact_id", "period");
