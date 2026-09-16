# Migración Excel a PostgreSQL

## Objetivo

Migrar las hojas activas de `local-data/BASE DE DATOS DG/En uso` a PostgreSQL sin modificar los Excel ni afectar la base actual de la plataforma.

La prueba local utiliza una base aislada:

```env
EXCEL_DATABASE_URL="postgresql://app:app@localhost:5432/dg_platform_excel?schema=public"
```

El esquema vigente de la aplicación continúa usando `DATABASE_URL` y permanece separado.

## Archivos principales

- `docs/database-schema.dbml`: diagrama para dbdiagram.io.
- `prisma/excel-migration.prisma`: modelo Prisma de las 17 tablas nuevas.
- `prisma/excel-migrations/20260828_initial/migration.sql`: migración SQL para una base vacía.
- `scripts/profile-excel-migration.ts`: perfil de tipos, duplicados y relaciones.
- `scripts/migrate-excel-to-postgres.ts`: importador idempotente.
- `scripts/validate-excel-postgres.ts`: comparación independiente Excel vs. PostgreSQL.

## Flujo local

1. Iniciar PostgreSQL:

   ```powershell
   docker compose up -d postgres
   ```

2. Crear una base vacía para la primera ejecución:

   ```powershell
   docker exec dg_postgres createdb -U app dg_platform_excel
   ```

3. Validar y generar el cliente del esquema de migración:

   ```powershell
   npm run db:excel:validate
   npm run db:excel:generate
   ```

4. Crear las tablas en la base vacía:

   ```powershell
   npx prisma db execute --file prisma/excel-migrations/20260828_initial/migration.sql --schema prisma/excel-migration.prisma
   ```

5. Perfilar y ensayar la transformación sin escrituras:

   ```powershell
   npm run data:profile
   npm run data:migrate:dry
   ```

6. Importar y validar:

   ```powershell
   npm run data:migrate
   npm run data:validate
   ```

## Idempotencia y trazabilidad

Cada archivo se registra en `source_files` con su checksum SHA-256. Cada hoja se registra en `import_batches` con estado, cantidad de filas y errores. Si el mismo checksum ya tiene un lote completado, el importador omite esa hoja y no duplica filas.

Las filas conservan `source_row_number`, y los IDs string originales se guardan como `legacy_id`. Los nuevos IDs son `BIGINT` autoincrementales.

## Observaciones de los datos actuales

- Existen proveedores y un producto duplicados en los Excel; sus filas se preservan.
- Seis productos tienen una categoría que no existe en el maestro. Conservan `categoria_original` y quedan con `categoria_id = NULL`.
- Hay precios históricos cuyos códigos de producto no están en el maestro actual. Se preservan porque Precios se replica como una tabla independiente.
- Una fila de Egresos tiene dos contenidos concatenados en `Cantidad`. La fila se preserva con el texto en `cantidad_original`, `cantidad = NULL` y una explicación en `migration_warning`.
- `Entregado` en Ingresos y Tango representa una cantidad, no un booleano.
- `Costo Actualizado` es un estado textual (`OK` o `Falta Actualizar`).

## Resultado de la primera prueba local

- 17 tablas creadas.
- 242.654 filas migradas, contando las 267 marcas derivadas de Productos.
- Cero filas rechazadas en lotes completados.
- Conteos de todas las tablas coincidentes con Excel.
- `Ingresos.Cantidad`: 554.079 en Excel y PostgreSQL.
- `Ingresos.Entregado`: 549.009 en Excel y PostgreSQL.
- `Egresos.Cantidad` numérica: 145.190 en Excel y PostgreSQL.

## Despliegue futuro

La misma migración SQL y el mismo importador pueden ejecutarse sobre una base PostgreSQL vacía en DigitalOcean cambiando solamente `EXCEL_DATABASE_URL`. La base nunca debe exponerse directamente al navegador: el frontend se conectará al backend/API y el backend usará la conexión privada a PostgreSQL.

## Conexión actual con el frontend

Con `DG_DATA_SOURCE="postgresql"`, las APIs que ya utilizaba el frontend leen y escriben PostgreSQL para:

- Productos, marcas, proveedores y categorías.
- Clientes, tasas y códigos de cliente.
- Precios y preview de importación de listas.
- Ingresos Tango.
- Egresos Santander.
- Stock Santander.
- Estructura de costos y criterios de flete.

PostgreSQL es la única fuente operativa. `DG_DATA_SOURCE` ya no permite activar Excel ni existe una reversión automática a archivos locales. Los archivos Excel se conservan como formatos de importación/exportación y fuentes para los scripts de migración.
