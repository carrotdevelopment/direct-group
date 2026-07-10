# Baseline de calidad

Este documento resume los controles transversales mínimos para dejar la plataforma en una base confiable antes de profundizar validaciones por módulo.

## Datos locales

La app usa la carpeta definida por `DG_LOCAL_DB_DIR`. En esta máquina quedó configurada como:

```env
DG_LOCAL_DB_DIR="./local-data/BASE DE DATOS DG"
```

La carpeta `local-data/` está ignorada por Git para evitar subir bases reales por accidente.

Para verificar estado de bases:

```bash
curl http://localhost:3000/api/local-db/health
```

También se puede ver desde:

```text
/configuracion
```

El diagnóstico marca:

- carpeta activa;
- archivos requeridos presentes/faltantes;
- archivos opcionales/cache presentes;
- archivos requeridos muy livianos que podrían haber sido generados por la app como semilla.

## Carga de archivos

Los endpoints de carga validan extensión y tamaño antes de leer el archivo:

- Precios: `.xlsx`, `.xls`, `.pdf`.
- Ingresos: `.xlsx`, `.xls`.
- Egresos: `.xlsx`, `.xls`.

El tamaño máximo por defecto es 150 MB. Se puede ajustar con:

```env
DG_MAX_UPLOAD_MB="150"
```

## Chequeos obligatorios antes de entregar

```bash
npm run db:generate
npm run typecheck
npm run lint
npm run test
npm run build
```

## Riesgo conocido

`xlsx` reporta vulnerabilidad alta sin fix disponible en `npm audit`. Mientras exista esta dependencia:

- procesar archivos solo en servidor;
- no exponer archivos a ejecución ni servirlos desde `public/`;
- limitar tamaño y extensión;
- considerar migración futura a una alternativa mantenida o a un worker aislado.

## Próxima etapa

Después del baseline, las validaciones deben pasar a ser específicas por módulo:

- Productos: unicidad de código único, proveedor/categoría válidos, campos obligatorios.
- Códigos cliente: período válido, no duplicados por cliente/mes/código.
- Precios: costo, IVA, precio público, markup y fecha coherentes.
- Ingresos/Egresos: estructura por cliente, cantidades positivas, fechas válidas y códigos existentes.
- Stock/Estructura de costos: trazabilidad de origen y diferencias explicables.

Las restricciones definitivas pensadas para PostgreSQL quedan en [POSTGRESQL-CONCURRENCY](POSTGRESQL-CONCURRENCY.md).
