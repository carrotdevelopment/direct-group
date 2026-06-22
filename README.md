# DG Platform

Plataforma web B2B para gestionar catálogo, clientes, proveedores, pricing, compras, ventas, importaciones y stock trazable de Direct Group.

## Estado de esta entrega

Esta base implementa:

- Dashboard ejecutivo responsive y navegación completa por módulos.
- Modelo Prisma para productos, equivalencias, vigencias de precios, operaciones, archivos, IA, jobs y auditoría.
- Autenticación con Auth.js y matriz RBAC para `ADMIN`, `VENDEDOR`, `DEPOSITO` y `LECTURA`.
- API tipada con tRPC y validación Zod.
- Ledger de stock y transferencias atómicas con control de stock negativo.
- BullMQ/Redis con política de reintentos e idempotencia.
- Seed local y tests de pricing, permisos y validación de transferencias.

Los datos visibles del dashboard son una capa demo intencional. Permiten validar UX sin depender de infraestructura; los servicios y el esquema de persistencia están listos para reemplazarlos progresivamente por queries tRPC.

## Desarrollo local

Requisitos: Node.js 24 LTS y Docker.

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

En otra terminal:

```bash
npm run worker:dev
```

La contraseña del usuario seed debe definirse con `SEED_ADMIN_PASSWORD`. Si se omite en un entorno estrictamente local, el seed usa `DirectGroup2026!`.

## Calidad

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Decisiones importantes

- `stock_movimientos` es la única fuente de verdad; el stock nunca se edita como saldo mutable.
- Una transferencia crea `TRANSFER_OUT` y `TRANSFER_IN` en la misma transacción.
- Los imports críticos exigen preview y confirmación humana.
- Los archivos se guardan fuera de `public/` y nunca se ejecutan.
- Las operaciones masivas usan claves de idempotencia.
- Se usa una versión soportada de Next.js en lugar de Next.js 14, que está fuera de soporte. Ver [ADR-001](docs/ADR-001-framework-version.md).

La especificación funcional original permanece en [`arquitectura.md`](arquitectura.md).
