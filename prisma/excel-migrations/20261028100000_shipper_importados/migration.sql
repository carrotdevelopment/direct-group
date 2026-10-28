-- Lo que sale de Importados en Urbano usa el shipper de Credicoop (1247); el stock se descuenta de Importados.
UPDATE "urbano_shippers"
SET "clientes" = ARRAY['Credicoop', 'Importados'], "updated_at" = CURRENT_TIMESTAMP
WHERE "codigo" = '1247' AND NOT ('Importados' = ANY("clientes"));
