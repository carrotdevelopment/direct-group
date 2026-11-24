-- Carga las estructuras de costo de los Excel. Reemplaza las filas HISTORICO del mismo cliente + período + código;
-- no toca las guardadas desde la plataforma (origen WEB) ni las que no están en el Excel.
-- Uso, con mig_costos ya cargada con el CSV de preparar-costos.py:
--   psql -v ON_ERROR_STOP=1 -v base=<nombre exacto de la base> -v final=ROLLBACK -f cargar-costos.sql
\set ON_ERROR_STOP on
select current_database() = :'base' as base_ok \gset
\if :base_ok
\else
  do $$ begin raise exception 'La base conectada no es la indicada en -v base'; end $$;
\endif
begin;
lock table base_estructura_costos_santander in share row exclusive mode;
\echo == Filas WEB que se conservan
select m.cl, c.periodo, c.codigo_cliente, c.pvc_sin_iva pvc_web, m.pvc pvc_excel from base_estructura_costos_santander c
left join mig_costos m on lower(m.cl) = lower(c.cliente) and m.per = c.periodo and lower(m.cod) = lower(btrim(c.codigo_cliente)) and coalesce(m.canal, '') = coalesce(c.canal, '')
where c.origen is distinct from 'HISTORICO';
\echo == Filas HISTORICO que ya estaban: cuántas están en el Excel y cuántas con otro precio de venta
select c.cliente, count(*) total, count(m.cl) en_excel, count(*) filter (where abs(c.pvc_sin_iva - m.pvc) > 1) otro_pvc,
  count(*) filter (where abs(c.costo_dg_sin_iva - m.costo) > 1) otro_costo
from base_estructura_costos_santander c
left join mig_costos m on lower(m.cl) = lower(c.cliente) and m.per = c.periodo and lower(m.cod) = lower(btrim(c.codigo_cliente)) and coalesce(m.canal, '') = coalesce(c.canal, '')
where c.origen = 'HISTORICO' group by 1 order by 1;

delete from base_estructura_costos_santander c using mig_costos m
where c.origen = 'HISTORICO' and lower(m.cl) = lower(c.cliente) and m.per = c.periodo and lower(m.cod) = lower(btrim(c.codigo_cliente)) and coalesce(m.canal, '') = coalesce(c.canal, '');
insert into base_estructura_costos_santander (cliente, periodo, mes, anio, fecha, codigo_cliente, codigo_unico, costo_actualizado, producto,
  proveedor, categoria, precio_publico, iva, mark_up, pp_sin_iva, costo_dg_sin_iva, seguro, ingresos_brutos, impuesto_debito,
  impuesto_credito, flete_sin_iva, costo_total, pvc_sin_iva, pvc_con_iva, utilidad, porcentaje, impuesto_misiones, peso_volumetrico,
  bultos, porcentaje_amex, canal, comision_canal_pct, origen, updated_at)
select m.cl, m.per, m.mes, m.anio, make_date(m.anio, m.mes, 1), m.cod, m.cu, m.act, m.prod, m.prov, m.cat, m.pp, m.iva, m.mk, m.pp_si,
  m.costo, m.seguro, m.iibb, m.deb, m.cred, m.flete, m.total, m.pvc, m.pvc_iva, m.util, m.pct, m.mis, m.peso, m.bultos, m.pct_amex, nullif(m.canal, ''), m.com_pct,
  'HISTORICO', now()
from mig_costos m
where not exists (select 1 from base_estructura_costos_santander c
  where lower(c.cliente) = lower(m.cl) and c.periodo = m.per and lower(btrim(c.codigo_cliente)) = lower(m.cod) and coalesce(m.canal, '') = coalesce(c.canal, ''));

\echo == Resultado
select cliente, canal, origen, count(*), min(periodo), max(periodo), count(*) filter (where pvc_sin_iva = 0) sin_pvc,
  count(*) filter (where costo_dg_sin_iva = 0) sin_costo from base_estructura_costos_santander group by 1, 2, 3 order by 1, 2, 3;
\echo == Códigos vigentes de cada cliente con y sin estructura cargada
select b.cliente, count(distinct lower(b.codigo_cliente)) vigentes, count(distinct lower(b.codigo_cliente)) filter (where exists (
  select 1 from base_estructura_costos_santander c where lower(c.cliente) = lower(b.cliente) and lower(btrim(c.codigo_cliente)) = lower(btrim(b.codigo_cliente)))) con_estructura
from base_codigo_cliente b where b.activo group by 1 order by 1;
\echo == Códigos repetidos en el mismo período (tiene que dar 0)
select count(*) from (select 1 from base_estructura_costos_santander where codigo_cliente <> '' group by lower(cliente), periodo, lower(btrim(codigo_cliente)), canal having count(*) > 1) x;
:final;
