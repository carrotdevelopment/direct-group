-- Stock informado de cada código, compartido y con quién y cuándo lo cambió. codigo_cliente en minúsculas.
-- sobre_ingreso: cantidad es la diferencia contra el ingreso físico (los "=I8-2" del Excel) y no un número fijo.
-- cantidad vacía: alguien borró el valor y vuelve a lo que corresponde al cliente.
CREATE TABLE IF NOT EXISTS "stock_informado" (
  "cliente" VARCHAR(100) NOT NULL,
  "codigo_cliente" VARCHAR(100) NOT NULL,
  "cantidad" NUMERIC(18, 4),
  "sobre_ingreso" BOOLEAN NOT NULL DEFAULT false,
  "updated_by" VARCHAR(255) NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("cliente", "codigo_cliente")
);
