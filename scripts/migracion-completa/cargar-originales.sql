-- Agrega a los egresos migrados los datos de las planillas (certificado, nombre, dirección, etc.). Solo completa
-- raw_row_id: no toca fecha, código, cantidad ni operación. Requiere mig_originales cargada con originales.csv.
-- Uso: psql -v ON_ERROR_STOP=1 -v base=<nombre exacto> -v final=ROLLBACK|COMMIT -f cargar-originales.sql
\set ON_ERROR_STOP on
select current_database() = :'base' as base_ok \gset
\if :base_ok
\else
  do $$ begin raise exception 'La base conectada no es la indicada en -v base'; end $$;
\endif
begin;
set local lock_timeout = '10s';
set local work_mem = '64MB';

-- Mismo egreso = mismo cliente, operación, fecha, código, cantidad, destino y comentario; si hay varios iguales, en orden.
-- Se arma antes de tomar el candado, así los usuarios esperan lo menos posible.
create temp table o on commit drop as
select n, cl, clave || '|' || row_number() over (partition by clave order by n) clave from
  (select n, cl, md5(concat_ws(chr(1), cl, op, coalesce(f::text, ''), cod, q::numeric(18, 4), coalesce(dest, ''), coalesce(com, ''))) clave from mig_originales) x;
create temp table e on commit drop as
select id, clave || '|' || row_number() over (partition by clave order by id) clave from
  (select id, md5(concat_ws(chr(1), cliente, operacion, coalesce(fecha::text, ''), codigo_cliente, cantidad::numeric(18, 4), coalesce(destino, ''), coalesce(comentarios, ''))) clave
   from egresos where created_by like 'migracion-excel-%' and raw_row_id is null) x;
analyze o;
analyze e;
create temp table par on commit drop as
select e.id egreso, o.n, o.cl, m.datos, nextval('egresos_raw_backup_id_seq') raw
from o join e using (clave) join mig_originales m on m.cl = o.cl and m.n = o.n;
analyze par;

lock table egresos in share row exclusive mode;

create temp table antes on commit drop as
select cliente, operacion, count(*) n, sum(cantidad) u, count(*) filter (where deleted_at is null) vivos,
  md5(string_agg(md5(concat_ws('|', id, fecha, codigo_cliente, codigo_unico, producto, cantidad, destino, comentarios, deleted_at, source_hash)), '' order by id)) h
from egresos group by 1, 2;

insert into egresos_lotes_importacion (cliente, tipo_origen, nombre_archivo, status, filas_totales, filas_importadas, finished_at)
select cl, 'MIGRACION', 'Planillas (migración)', 'MIGRADO', count(*), count(*), now() from mig_originales group by 1;

insert into egresos_raw_backup (id, lote_id, cliente, numero_fila_origen, datos_originales)
select p.raw, l.id, p.cl, p.n, p.datos from par p join egresos_lotes_importacion l on l.cliente = p.cl and l.tipo_origen = 'MIGRACION';
update egresos e set raw_row_id = p.raw from par p where p.egreso = e.id and e.raw_row_id is null;
update egresos_lotes_importacion l set filas_importadas = (select count(*) from egresos_raw_backup r where r.lote_id = l.id) where tipo_origen = 'MIGRACION';

\echo == Filas de la planilla y cuántas encontraron su egreso
select o.cl, count(*) planilla, (select count(*) from par p where p.cl = o.cl) unidas from mig_originales o group by 1 order by 1;
do $$ begin
  if (select count(*) from par) <> (select count(*) from mig_originales) then raise exception 'Hay filas de la planilla sin su egreso'; end if;
  if (select count(*) from egresos where raw_row_id is not null and created_by like 'migracion-excel-%') <> (select count(*) from par) then raise exception 'No se unieron todas'; end if;
  if exists (
    (select cliente, operacion, count(*) n, sum(cantidad) u, count(*) filter (where deleted_at is null) vivos,
      md5(string_agg(md5(concat_ws('|', id, fecha, codigo_cliente, codigo_unico, producto, cantidad, destino, comentarios, deleted_at, source_hash)), '' order by id)) h
     from egresos group by 1, 2) except select * from antes)
  then raise exception 'Cambió algún egreso: no tenía que cambiar ninguno'; end if;
end $$;
select e.id, e.fecha, e.codigo_cliente, r.datos_originales ->> 'Fecha (planilla)' fecha_planilla from egresos e join egresos_raw_backup r on r.id = e.raw_row_id
where e.cliente = 'Amex' and r.datos_originales ->> 'N° Certificado' = '3201523638';
:final;
