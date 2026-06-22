# ADR-001 — Versión mantenida de Next.js

## Estado

Aceptada — 22 de junio de 2026.

## Contexto

La arquitectura inicial prescribe Next.js 14. Esa rama está fuera de soporte y no recibe todas las correcciones de seguridad actuales. Una plataforma que procesa información comercial, usuarios y archivos externos no debe comenzar su vida útil sobre una base EOL.

## Decisión

Mantener App Router, Server Components, Route Handlers y el monolito modular definidos en la arquitectura, pero instalar la versión estable y mantenida de Next.js resuelta por el lockfile.

Node.js 24 LTS es el runtime de referencia.

## Consecuencias

- Se conserva el diseño funcional y el modelo de despliegue.
- Se evitan vulnerabilidades sin backport y una migración mayor inmediata.
- La CI debe revisar actualizaciones y ejecutar build, typecheck, lint y tests.
