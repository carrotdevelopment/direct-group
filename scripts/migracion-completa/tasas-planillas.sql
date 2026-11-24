-- Tasas de cada cliente como las calculan sus planillas, vigentes desde 2026-01. No borra las anteriores.
-- Necesita el código que entiende PRECIO_IVA (tasa sobre el PVC con IVA): primero se despliega, después se corre.
-- Uso: psql -v ON_ERROR_STOP=1 -v base=<nombre exacto de la base> -v final=ROLLBACK -f tasas-planillas.sql
\set ON_ERROR_STOP on
select current_database() = :'base' as base_ok \gset
\if :base_ok
\else
  do $$ begin raise exception 'La base conectada no es la indicada en -v base'; end $$;
\endif
begin;
create temp table t(cliente text, clave text, pct numeric, sobre text) on commit drop;
insert into t values
  ('Amex','seguro',1,'COSTO'),('Amex','ingresos_brutos',5,'PRECIO'),('Amex','impuesto_debito',0.396,'PRECIO_IVA'),('Amex','impuesto_credito',0.6,'PRECIO_IVA'),('Amex','impuesto_misiones',1.25,'PRECIO'),
  ('Pampa','seguro',1,'COSTO'),('Pampa','ingresos_brutos',5,'PRECIO'),('Pampa','impuesto_debito',0.396,'PRECIO_IVA'),('Pampa','impuesto_credito',0.6,'PRECIO_IVA'),('Pampa','impuesto_misiones',1.25,'PRECIO_IVA'),
  ('Santander','seguro',1.2,'COSTO'),('Santander','ingresos_brutos',5,'PRECIO'),('Santander','impuesto_debito',0.6,'PRECIO_IVA'),('Santander','impuesto_credito',0.6,'PRECIO_IVA'),('Santander','impuesto_misiones',1.25,'PRECIO_IVA'),
  ('Credicoop','seguro',1,'COSTO'),('Credicoop','ingresos_brutos',5,'PRECIO'),('Credicoop','impuesto_debito',0.6,'PRECIO_IVA'),('Credicoop','impuesto_credito',0.6,'PRECIO_IVA'),
  ('Massalin','seguro',1,'COSTO'),('Massalin','ingresos_brutos',5,'PRECIO'),('Massalin','impuesto_debito',0.6,'PRECIO_IVA'),('Massalin','impuesto_credito',0.6,'PRECIO_IVA'),
  -- La utilidad de la planilla de Umiles no resta crédito ni Misiones.
  ('Umiles','seguro',1,'COSTO'),('Umiles','ingresos_brutos',5,'PRECIO'),('Umiles','impuesto_debito',0.396,'PRECIO_IVA');
do $$ begin
  if exists (select 1 from base_config_tasas_clientes b join (select distinct cliente from t) x using (cliente) where b.vigente_desde > date '2024-01-01') then
    raise exception 'Alguno de los clientes ya tiene tasas posteriores a 2024-01: revisar antes';
  end if;
end $$;
-- Parte de la configuración actual (mismos nombres, orden y cliente); la tasa que la planilla no usa queda "No aplica".
insert into base_config_tasas_clientes (legacy_id, cliente_id, cliente, vigente_desde, nombre_tasa, clave, aplica, valor_porcentaje, aplica_sobre, orden, creado, updated_at)
select 'tasa-' || b.cliente_id || '-2026-01-' || b.clave, b.cliente_id, b.cliente, date '2026-01-01', b.nombre_tasa, b.clave, t.clave is not null,
  coalesce(t.pct, b.valor_porcentaje), coalesce(t.sobre, b.aplica_sobre), b.orden, now(), now()
from base_config_tasas_clientes b left join t on t.cliente = b.cliente and t.clave = b.clave
where b.cliente in (select cliente from t) and b.vigente_desde = date '2024-01-01';
do $$ begin
  if (select count(*) from base_config_tasas_clientes where vigente_desde = date '2026-01-01' and aplica) <> (select count(*) from t) then
    raise exception 'No coincide la cantidad de tasas cargadas';
  end if;
end $$;
select cliente, clave, aplica, valor_porcentaje::float8, aplica_sobre from base_config_tasas_clientes where vigente_desde = date '2026-01-01' order by cliente, orden;
:final;
