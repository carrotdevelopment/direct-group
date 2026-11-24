-- Perfil de importación de egresos de Credicoop: el código del producto es IdRecompensa (antes tomaba IdRedencion,
-- el número de canje) y el producto es Descripcion (antes, si faltaba, usaba el nombre de la persona).
-- Uso: psql -v ON_ERROR_STOP=1 -v base=<nombre exacto de la base> -v final=ROLLBACK -f perfil-credicoop.sql
\set ON_ERROR_STOP on
select current_database() = :'base' as base_ok \gset
\if :base_ok
\else
  do $$ begin raise exception 'La base conectada no es la indicada en -v base'; end $$;
\endif
begin;
update egresos_perfiles_importacion
set mapeo = mapeo || '{"clientCode": ["IdRecompensa"], "product": ["Descripcion"]}'::jsonb, updated_at = now()
where cliente = 'Credicoop' and version = 1 and mapeo -> 'clientCode' = '["IdRedencion", "IdRecompensa"]'::jsonb;
do $$ begin
  if not exists (select 1 from egresos_perfiles_importacion where cliente = 'Credicoop' and activo and mapeo -> 'clientCode' = '["IdRecompensa"]'::jsonb) then
    raise exception 'El perfil de Credicoop no quedó como se esperaba';
  end if;
end $$;
select cliente, mapeo from egresos_perfiles_importacion where cliente = 'Credicoop';
:final;
