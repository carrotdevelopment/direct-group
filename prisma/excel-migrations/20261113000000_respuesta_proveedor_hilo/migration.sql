-- Hilo de Gmail de la respuesta del proveedor al último pedido, para abrir su adjunto desde Precios.
ALTER TABLE supplier_mail_contacts ADD COLUMN respuesta_hilo_id VARCHAR(64);
