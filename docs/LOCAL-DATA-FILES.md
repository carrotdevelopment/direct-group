# Archivos locales de datos

La web usa archivos Excel/JSON locales desde la carpeta configurada en `DG_LOCAL_DB_DIR`.

En esta máquina, si no se define `DG_LOCAL_DB_DIR`, la carpeta por defecto es:

```text
C:\Users\ignac\OneDrive - Carrot\Desktop\BASE DE DATOS DG
```

Para que otra persona pueda levantar el proyecto igual en su computadora, tiene que copiar esa carpeta completa y configurar su `.env.local`:

```bash
DG_LOCAL_DB_DIR="C:\\ruta\\local\\BASE DE DATOS DG"
```

## Archivos detectados

- `Base Categorias DG.xlsx`
- `Base Codigo Cliente DG.xlsx`
- `Base Egresos Amex DG.json`
- `Base Egresos Amex DG.xlsx`
- `Base Egresos Credicoop DG.json`
- `Base Egresos Credicoop DG.xlsx`
- `Base Egresos HSBC DG.json`
- `Base Egresos HSBC DG.xlsx`
- `Base Egresos Importados DG.json`
- `Base Egresos Importados DG.xlsx`
- `Base Egresos Massalin DG.json`
- `Base Egresos Massalin DG.xlsx`
- `Base Egresos Pampa DG.json`
- `Base Egresos Pampa DG.xlsx`
- `Base Egresos Producteca DG.json`
- `Base Egresos Producteca DG.xlsx`
- `Base Egresos Santander DG.json`
- `Base Egresos Santander DG.xlsx`
- `Base Egresos Syngenta DG.json`
- `Base Egresos Syngenta DG.xlsx`
- `Base Egresos Umiles DG.json`
- `Base Egresos Umiles DG.xlsx`
- `Base Estructura Costos Santander DG.bak-20260629162929.xlsx`
- `Base Estructura Costos Santander DG.xlsx`
- `Base Ingresos DG.json`
- `Base Ingresos DG.xlsx`
- `Base Precios DG.json`
- `Base Precios DG.xlsx`
- `Base Productos DG.xlsx`
- `Base Proveedores DG.xlsx`
- `Base Stock Santander DG.xlsx`

## Recomendación

No subir estos archivos al repo público. Si el repo es privado y se decide versionarlos, usar Git LFS. Ya quedó configurado LFS para:

- `*.xlsx`
- `*.xls`
- `*.pdf`

Los archivos `.json` pueden ser grandes; si también se quieren versionar, agregarlos a Git LFS antes de hacer commit.

```bash
git lfs track "*.json"
```

La opción más simple para traspaso es compartir la carpeta `BASE DE DATOS DG` por OneDrive/Drive privado y que el otro dev configure `DG_LOCAL_DB_DIR`.
