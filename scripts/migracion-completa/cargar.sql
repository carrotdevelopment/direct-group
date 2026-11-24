-- Migración completa desde Excel: reemplaza egresos, ingresos y pasajes. Conserva maestros, costos, precios,
-- contactos, configuración, Urbano y usuarios. Todo en UNA transacción: si algo falla no cambia nada.
-- Uso, con mig_egresos y mig_ingresos ya cargadas con los CSV de preparar.py:
--   psql -v ON_ERROR_STOP=1 -v base=<nombre exacto de la base> -v final=ROLLBACK -f cargar.sql
-- final=ROLLBACK hace todo, muestra los números y lo deshace; final=COMMIT lo deja aplicado.
\set ON_ERROR_STOP on
select current_database() = :'base' as base_ok \gset
\if :base_ok
\else
  do $$ begin raise exception 'La base conectada no es la indicada en -v base'; end $$;
\endif
begin;
select pg_advisory_xact_lock(734901627); -- el mismo candado de la sincronización de Tango
lock table egresos, tango_ingresos, pasaje_requests in access exclusive mode;

-- 1. Compras de Tango del empalme (desde 2026-11-01) que NO están en el Excel: se conservan.
--    Se aparean de a una por código + cantidad entregada.
create temp table empalme on commit drop as
with t as (
  select id, codigo_cliente, entregado, fecha_entrega, orden_de_compra,
    regexp_replace(lower(btrim(codigo_cliente)), '^credi([0-9]+)$', '\1') k
  from tango_ingresos where external_key is not null and operacion = 'COMPRA' and fecha_entrega >= date '2026-11-01'
), tn as (select *, row_number() over (partition by k, entregado order by fecha_entrega, id) n from t),
x as (
  select lower(cod) k, ent, row_number() over (partition by lower(cod), ent order by g, f) n
  from mig_ingresos where op = 'COMPRA' and g between date '2026-10-25' and date '2026-11-23'
)
select tn.*, x.k is not null as en_excel from tn left join x on x.k = tn.k and x.ent = tn.entregado and x.n = tn.n;
\echo == Compras de Tango desde el 01/11: en el Excel o no
select en_excel, count(*), sum(entregado)::int unidades from empalme group by 1;
select fecha_entrega, codigo_cliente, entregado::int, orden_de_compra from empalme where not en_excel order by 1, 2;

-- 2. Limpieza
delete from egresos_cambios_producto;
delete from egresos;
delete from egresos_raw_backup;
delete from egresos_lotes_importacion;
delete from pasaje_requests;
delete from pasaje_lotes;
delete from ajuste_requests;
delete from tango_ingresos where id not in (select id from empalme where not en_excel);

-- 3. Egresos
insert into egresos (cliente, operacion, fecha, codigo_cliente, cantidad, destino, comentarios, codigo_unico, producto, created_by, updated_at)
select e.cl, e.op, e.f, e.cod, e.q, nullif(e.dest, ''), nullif(e.com, ''), u.cu, p.producto, 'migracion-excel-' || lower(e.cl), now()
from mig_egresos e
left join (
  select distinct on (lower(cliente), lower(btrim(codigo_cliente)))
    lower(cliente) c, lower(btrim(codigo_cliente)) k, lower(btrim(codigo_unico)) cu
  from base_codigo_cliente where coalesce(btrim(codigo_unico), '') <> ''
  order by lower(cliente), lower(btrim(codigo_cliente)), activo desc nulls last, anio_asignacion desc nulls last, mes_asignacion desc nulls last, id desc
) u on u.c = lower(e.cl) and u.k = lower(e.cod)
left join (
  select distinct on (lower(btrim(codigo_unico))) lower(btrim(codigo_unico)) k, producto
  from base_productos order by lower(btrim(codigo_unico)), id
) p on p.k = u.cu;

-- 4. Ingresos. pending_tango_entry = true: en false frenaría la sincronización de Tango.
insert into tango_ingresos (cliente, operacion, fecha_pedido, codigo_cliente, cantidad, origen_del_pasaje, fecha_entrega,
  entregado, comentarios, orden_de_compra, pending_tango_entry, created_by, updated_at)
select cl, op, f, cod, q, nullif(ori, ''), g, ent, nullif(com, ''), nullif(oc, ''), true, 'migracion-excel-' || lower(cl), now()
from mig_ingresos;

\echo == Filas y unidades cargadas contra los CSV (tienen que coincidir)
select 'egresos' tabla, (select count(*) from egresos) base, (select count(*) from mig_egresos) csv,
  (select sum(cantidad) from egresos) = (select sum(q) from mig_egresos) unidades_ok
union all
select 'ingresos', (select count(*) from tango_ingresos where created_by like 'migracion-excel-%'), (select count(*) from mig_ingresos),
  (select sum(entregado) from tango_ingresos where created_by like 'migracion-excel-%') = (select sum(ent) from mig_ingresos);
select cliente, count(*) egresos, max(fecha) ultimo, count(*) filter (where fecha is null) sin_fecha,
  count(*) filter (where codigo_unico is null) sin_codigo_unico from egresos group by 1 order by 1;
:final;
