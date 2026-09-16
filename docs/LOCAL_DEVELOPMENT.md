# Desarrollo local

## Servicios

`docker-compose.yml` levanta PostgreSQL 15 y Redis 7 con healthchecks y volúmenes persistentes.

## Flujo recomendado

1. Copiar `.env.example` a `.env`.
2. Levantar servicios con `docker compose up -d`.
3. Instalar dependencias y generar Prisma.
4. Crear la migración inicial con `npm run db:migrate`.
5. Ejecutar `npm run db:seed`.
6. Levantar web y worker en terminales separadas.
7. Antes de entregar, correr toda la suite de calidad.

Nunca usar datos reales de clientes o proveedores en fixtures versionados.

## Fuente de datos del frontend

El navegador consume los endpoints `/api/local-db/*`; nunca se conecta directamente a PostgreSQL.

La implementación del servidor se selecciona con:

```env
DG_DATA_SOURCE="postgresql"
```

Valores admitidos:

- `postgresql`: usa `EXCEL_DATABASE_URL` y las tablas migradas.
- `excel`: vuelve temporalmente a los archivos de `DG_LOCAL_DB_DIR`.

Para trabajar con PostgreSQL local:

```powershell
docker compose up -d postgres
npm run db:excel:generate
npm run dev
```

El endpoint `/api/local-db/health` informa la fuente activa y los conteos principales.
