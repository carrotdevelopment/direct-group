# Archivos locales de datos

La plataforma lee y escribe las bases operativas desde `DG_LOCAL_DB_DIR`.
Los datos reales no se versionan: toda la carpeta `local-data/` está ignorada
por Git.

## Carpeta local recomendada

```env
DG_LOCAL_DB_DIR="./local-data/BASE DE DATOS DG/En uso"
```

También se puede usar una ruta absoluta a una carpeta privada de OneDrive o
Drive. Si la variable no está definida, la aplicación usa automáticamente la
ruta local anterior.

## Fuentes requeridas actualmente

| Archivo | Hoja esperada | Uso |
| --- | --- | --- |
| `Base Productos DG.xlsx` | `Productos` | Catálogo y referencias de producto |
| `Base Codigo Cliente DG.xlsx` | `Codigos Cliente` | Equivalencias cliente-producto |
| `Base Proveedores DG.xlsx` | `Proveedores` | Maestro de proveedores |
| `Base Categorias DG.xlsx` | `Categorias` | Maestro de categorías |
| `Base Precios DG.xlsx` | `Precios` | Histórico de precios |
| `Base Clientes DG.xlsx` | `Clientes` | Maestro de clientes |
| `Base Config Tasas Clientes DG.xlsx` | `Tasas` | Tasas por cliente y vigencia |
| `Base Estructura Costos Santander DG.xlsx` | `Santander`, `Criterios Flete` | Estructura, histórico de costos y criterios de flete |
| `Base Stock Santander DG.xlsx` | `Santander` | Datos base de stock |
| `Base Ingresos DG.xlsx` | `Ingresos` | Ingresos usados en el cálculo de stock |
| `Consulta ingresos Tango.xlsx` | `Consulta1` | Pantalla de ingresos Tango |
| `Base Egresos Santander DG.xlsx` | `Santander` | Egresos usados en el cálculo de stock |

La carpeta operativa no requiere archivos JSON. Productos, precios, ingresos,
egresos, stock y estructura de costos leen y escriben exclusivamente Excel.
Los criterios de flete se guardan en una segunda hoja del Excel de estructura
de costos.

## Verificación

```bash
npm run data:check
```

El mismo diagnóstico está disponible en `/configuracion` y en
`/api/local-db/health` con la aplicación levantada.
