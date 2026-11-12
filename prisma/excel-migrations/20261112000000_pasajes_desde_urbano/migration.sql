-- Salidas de Urbano que son un pasaje de stock: el destinatario del PICKING es "PASAJE DE STOCK".
-- La plataforma crea el pasaje desde esa salida (ya no se cargan a mano).
ALTER TABLE urbano_movimientos ADD COLUMN salida_pasaje BOOLEAN NOT NULL DEFAULT false;

-- Salidas de pasaje ya guardadas antes de este cambio (la API solo repite los últimos 7 días),
-- vistas el 2026-11-12: Credicoop 5/11 y 10/11, Pampa 10/11 y Massalin 10/11.
UPDATE urbano_movimientos SET salida_pasaje = true
WHERE tipo = 'PICKING' AND pasaje_id IS NULL AND comprobante IN (
  'C10010061702307', 'C10010061702308', 'C10010061702309',
  'C10010061768690', 'E10010061768692', 'K10010061768693'
);
