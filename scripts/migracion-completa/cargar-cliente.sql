-- Agrega los egresos e ingresos de UN cliente que todavía no tiene movimientos. No borra ni modifica nada.
-- Uso, con mig_egresos y mig_ingresos ya cargadas con los CSV de preparar.py:
--   psql -v ON_ERROR_STOP=1 -v base=<nombre exacto de la base> -v cliente=Syngenta -v final=ROLLBACK -f cargar-cliente.sql
\set ON_ERROR_STOP on
select current_database() = :'base' as base_ok \gset
\if :base_ok
\else
  do $$ begin raise exception 'La base conectada no es la indicada en -v base'; end $$;
\endif
begin;
select pg_advisory_xact_lock(734901627); -- el mismo candado de la sincronización de Tango
lock table egresos, tango_ingresos in share row exclusive mode;
select not exists (select 1 from egresos where lower(btrim(cliente)) = lower(:'cliente'))
  and not exists (select 1 from tango_ingresos where lower(btrim(cliente)) = lower(:'cliente'))
  and exists (select 1 from mig_egresos where cl = :'cliente') and exists (select 1 from mig_ingresos where cl = :'cliente') as listo \gset
\if :listo
\else
  do $$ begin raise exception 'El cliente ya tiene movimientos, o no hay datos suyos en las tablas mig_'; end $$;
\endif

insert into egresos (cliente, operacion, fecha, codigo_cliente, cantidad, destino, comentarios, codigo_unico, producto, created_by, updated_at)
select e.cl, e.op, e.f, e.cod, e.q, nullif(e.dest, ''), nullif(e.com, ''), u.cu, p.producto, 'migracion-excel-' || lower(e.cl), now()
from mig_egresos e
left join (
  select distinct on (lower(btrim(codigo_cliente))) lower(btrim(codigo_cliente)) k, lower(btrim(codigo_unico)) cu
  from base_codigo_cliente where lower(cliente) = lower(:'cliente') and coalesce(btrim(codigo_unico), '') <> ''
  order by lower(btrim(codigo_cliente)), activo desc nulls last, anio_asignacion desc nulls last, mes_asignacion desc nulls last, id desc
) u on u.k = lower(e.cod)
left join (
  select distinct on (lower(btrim(codigo_unico))) lower(btrim(codigo_unico)) k, producto
  from base_productos order by lower(btrim(codigo_unico)), id
) p on p.k = u.cu
where e.cl = :'cliente';

-- pending_tango_entry = true: en false frenaría la sincronización de Tango.
insert into tango_ingresos (cliente, operacion, fecha_pedido, codigo_cliente, cantidad, origen_del_pasaje, fecha_entrega,
  entregado, comentarios, orden_de_compra, pending_tango_entry, created_by, updated_at)
select cl, op, f, cod, q, nullif(ori, ''), g, ent, nullif(com, ''), nullif(oc, ''), true, 'migracion-excel-' || lower(cl), now()
from mig_ingresos where cl = :'cliente';

\echo == Cargado contra los CSV (tienen que coincidir)
select 'egresos' tabla, (select count(*) from egresos where cliente = :'cliente') base, (select count(*) from mig_egresos where cl = :'cliente') csv,
  (select sum(cantidad) from egresos where cliente = :'cliente') = (select sum(q) from mig_egresos where cl = :'cliente') unidades_ok
union all
select 'ingresos', (select count(*) from tango_ingresos where cliente = :'cliente'), (select count(*) from mig_ingresos where cl = :'cliente'),
  (select sum(entregado) from tango_ingresos where cliente = :'cliente') = (select sum(ent) from mig_ingresos where cl = :'cliente');
select count(*) filter (where fecha is null) sin_fecha, count(*) filter (where codigo_unico is null) sin_codigo_unico,
  count(*) filter (where producto is null) sin_producto from egresos where cliente = :'cliente';
:final;
