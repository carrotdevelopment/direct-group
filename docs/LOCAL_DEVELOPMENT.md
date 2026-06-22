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
