# Traspaso DG Platform

## Repo

Repositorio remoto configurado:

```bash
origin https://github.com/jmbistue/dg_platform.git
```

Rama actual de trabajo: `main`.

## Levantar local

```bash
npm install
npm run dev
```

Abrir:

```text
http://localhost:3000/dashboard
```

Chequeos usados durante el desarrollo:

```bash
npm run typecheck
npm run lint
npm run test
```

## Bases Excel locales

La app lee y escribe bases Excel desde `DG_LOCAL_DB_DIR`.

Si la variable no está definida, usa esta carpeta relativa al proyecto:

```text
../../BASE DE DATOS DG
```

Archivos principales esperados/generados:

- `Base Productos DG.xlsx`
- `Base Codigo Cliente DG.xlsx`
- `Base Proveedores DG.xlsx`
- `Base Categorias DG.xlsx`
- `Base Precios DG.xlsx`
- `Base Precios DG.json`
- `Base Estructura Costos Santander DG.xlsx`
- `Base Stock Santander DG.xlsx`
- `Base Ingresos DG.xlsx`
- `Base Egresos Santander DG.xlsx`

Para otro desarrollador, copiar la carpeta real de bases Excel y configurar en `.env.local`:

```bash
DG_LOCAL_DB_DIR="C:\\ruta\\a\\BASE DE DATOS DG"
```

## Sobre subir Excels a GitHub

Se puede, pero conviene hacerlo solo si el repo es privado y los datos no son sensibles. GitHub no es una base de datos: la app no lee automáticamente desde GitHub en runtime, lee archivos locales. Si se suben Excel pesados o PDFs de proveedores, usar Git LFS.

Recomendación:

- Código en GitHub.
- Bases Excel reales en una carpeta compartida privada o Git LFS.
- Cada dev configura `DG_LOCAL_DB_DIR` apuntando a su copia local.

## Módulo Precios

Se agregó importación asistida con preview editable para listas de proveedores.

Formatos trabajados:

- `SILVESTRIN`: Excel `Lista Base`, toma código/producto, costo, precio sugerido y calcula markup.
- `ACEGAME`: Excel `NOTA DE PEDIDO`, procesa solo esa hoja, toma `PRECIO VTA. S/IVA` como costo, `PVP` como precio público e `IMP` como IVA.
- `AGROYTEC`: Excel con columnas `Marca`, `Codigo`, `Descripcion`, `IVA`, `PVP`, `Contado`, `Plazo`; toma `Contado` como costo DG, `PVP` como precio público e `IVA`.
- `ALPACA`: PDF ilustrado. Cruza contra productos de `COMERCIAL ALPACA` aunque se elija `ALPACA`. Toma el precio con IVA incluido como base para calcular `Costo DG` neto, deja `Precio público` en `0` y `Markup` en `0`.

Regla importante:

- En el módulo Precios, el filtro por mes/año muestra solo precios cargados exactamente para ese mes/año.
- En Estructura de costo y Stock, si no hay precio del mes pedido, se usa el último precio/costo disponible hacia atrás.

## Pendientes sugeridos

- Revisar manualmente previews de PDFs ilustrados como ALPACA antes de confirmar carga.
- Decidir dónde alojar bases Excel reales y archivos originales de proveedores.
- Si se quiere versionar Excel/PDF en GitHub, inicializar Git LFS para `*.xlsx`, `*.xls`, `*.pdf`.
