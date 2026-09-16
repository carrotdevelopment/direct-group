# Egresos canónicos y respaldo original

## Controles implementados el 9 de septiembre de 2026

- Duplicados: mismo archivo por cliente y misma fila original, dentro de una
  carga o entre cargas. La comparación conserva todas las columnas de negocio,
  normaliza espacios exteriores y orden de columnas. No identifica como iguales
  operaciones que llegan con distintos encabezados o datos modificados.
  Si hay un duplicado, se rechaza la carga completa. Las importaciones del mismo
  cliente se serializan con un advisory lock transaccional. Los lotes fallidos
  liberan el hash de archivo para permitir corregir y reintentar.
- Auditoría: `created_by`, `modified_by` y `deleted_by` provienen de la sesión
  autenticada. Los registros históricos mantienen NULL donde no se conoce el
  autor. Mutaciones sin sesión o con rol LECTURA se rechazan.
- Bajas: filas seleccionadas, lote completo o rango inclusivo de fecha de
  operación, siempre por cliente y con `deleted_at`. La vista previa de alcance
  y la baja masiva consultan toda la base; no dependen del límite de 5000 filas
  de la grilla. El respaldo original se conserva.
- Pantalla: ID de egreso visible, filtros Hoy/Ayer/7 días/30 días/Este mes/Mes
  anterior consultados en servidor y lenguaje de inactivación para registros
  persistidos. Eliminar filas del formulario antes de subir sigue siendo local.
- Los campos originales mostrados por la grilla se completan con los valores
  canónicos actuales mediante el perfil de columnas; el respaldo no se edita.

La migración aditiva `prisma/excel-migrations/20260909_egress_controls/migration.sql`
fue aplicada a PostgreSQL local. No se unificaron las tablas ni se borraron
registros. Las filas antiguas sin hash se contrastan con su respaldo original.

Validación: 49 pruebas automatizadas aprobadas, typecheck, lint y build aprobados.
Chrome headless: ID visible, fechas relativas enviadas al servidor, vista previa
de 6000 filas, cancelación sin escritura, baja por lote y baja por fechas con
actualización de la grilla. Persistencia simulada y escrituras reales bloqueadas
en `dev/validate-egress-ui.mjs`; captura `dev/egress-ui-functional.png`.
No se validó una importación real ni se inactivaron egresos reales durante las
pruebas. La prueba de concurrencia verifica que se toma el lock; no sustituye
una prueba de carga con múltiples conexiones PostgreSQL.

El módulo usa dos capas en PostgreSQL:

- `egresos`: campos canónicos utilizados por la pantalla y por Stock.
- `egresos_raw_backup`: copia inmutable de cada fila recibida, con encabezados,
  valores ordenados y objeto original.

Cada carga crea un registro en `egresos_lotes_importacion`. Los archivos se
identifican por SHA-256 y no pueden importarse dos veces para el mismo cliente.
Las eliminaciones de la pantalla son bajas lógicas en `egresos`; nunca eliminan
el respaldo raw.

Los formatos se guardan en `egresos_perfiles_importacion`. Hay perfiles
iniciales para Amex, Credicoop, HSBC, Importados, Massalin, Pampa, Producteca,
Santander, Syngenta y Umiles. Los mapeos inferidos se pueden corregir desde la
pantalla antes de incorporar archivos reales de cada cliente.

## Puesta en marcha

Con PostgreSQL iniciado:

```powershell
npx prisma migrate deploy --schema prisma/excel-migration.prisma
npm run data:migrate:egresos
```

La migración histórica es idempotente. Santander se toma primero de la tabla
anterior `base_egresos_santander`; si está vacía, se usa su Excel. Para los
demás clientes se utilizan los archivos `Base Egresos {Cliente} DG.xlsx`
disponibles en `DG_LOCAL_DB_DIR`.
