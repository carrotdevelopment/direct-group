-- Descripción del producto en el origen y en el destino, tal como se carga la solicitud de pasaje. Van en
-- los Excel que se mandan a Urbano.
ALTER TABLE pasaje_requests ADD COLUMN descripcion_origen VARCHAR(255);
ALTER TABLE pasaje_requests ADD COLUMN descripcion_destino VARCHAR(255);
