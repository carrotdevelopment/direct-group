# Handoff: migración completa y salida del martes 24/11/2026

> **Cómo usar este archivo.** Es la fuente única de verdad para retomar el trabajo desde otra cuenta
> o sesión de Claude. Leerlo entero antes de tocar producción. Al avanzar, **actualizar las secciones
> 1 (urgente), 4 (estado) y 9 (registro de cambios)** y tildar los `[ ]`.
> Última actualización: **viernes 2026-11-20** (foto de producción tomada ese día).
>
> Prompt de arranque sugerido para la próxima sesión:
> *"Leé docs/HANDOFF-MIGRACION-COMPLETA-2026-11-24.md y la memoria del proyecto. Estamos en el punto
> [X] del plan de la sección 2. No toques producción sin que yo lo pida explícitamente."*

---

## 1. URGENTE: salida del martes 24/11/2026

| Fecha | Qué pasa |
|---|---|
| **Vie 20/11** (hoy) | Última jornada hábil antes de la salida. |
| **Lun 23/11** | **Feriado.** Es el día para migrar y verificar sin que nadie use la plataforma. |
| **Mar 24/11** | **Las chicas dejan las planillas de Excel y pasan a usar solo la plataforma.** |

**Plan del usuario:** borrar la información que hay en la plataforma y hacer una **migración completa
desde cero**, hasta el último día disponible de todo lo que hay en los Excel, para que arranquen sin
problemas.

### 1.1 Decisiones que hay que tomar ANTES de borrar (riesgos reales)

"Borrar todo" y recargar es posible, pero **destruye datos que no vienen de ningún Excel**. Revisar cada
punto y decidir; la recomendación está en negrita.

1. **`tango_ingresos` (141.238 filas, 2012-02 a 2026-11-19) viene de Tango, no de Excel.** Si se vacía,
   hay que volver a traerlo con el conector. Cada importación admite hasta 20.000 renglones, así que
   harían falta varios rangos de fechas, y **la pantalla Ingresos ya no tiene el botón "Importar ingresos"**
   (se sacó el 2026-10-07; queda el endpoint `POST /api/tango-sync` con `{from,to}` y sesión admin).
   **Recomendación: no vaciar las filas sincronizadas de Tango; borrar solo las manuales
   `created_by LIKE 'migracion-excel-%'` y recargarlas.**
2. **Lo que se cargó directamente en la plataforma desde que se usa** (pasajes, canjes importados en la
   app, bajas, cambios de producto, descripciones e imágenes de productos, contactos de proveedores,
   configuración). No existe en ningún Excel. **Recomendación: conservar esas tablas (lista en 2.2).**
3. **Productos:** `base_productos` tiene `imagen_url` (archivos en `storage/uploads/`) y `descripcion`
   editadas en la plataforma. Si se recarga solo desde Excel, **se pierden**. Recomendación: actualizar y
   agregar, no borrar.
4. **Pasajes confirmados** (17 al 2026-11-20) ya generaron egresos/ingresos. Si se borran los egresos del
   cliente origen, el stock deja de coincidir. Recomendación: **no borrar egresos creados por usuarios
   de la plataforma**; borrar solo los de origen Excel (ver 2.2).
5. **Clientes cuyo Excel de egresos está desactualizado** (ver tabla 3.2): Santander (hasta 28/09), HSBC
   (hasta 03/04), Producteca y Syngenta (hasta fines de junio) e Importados (hasta fin de junio). Si el
   martes entran sin cargar sus Excel más nuevos, **arrancan con stock viejo**. Hay que pedir esos archivos hoy.
6. **Nada se borra sin respaldo probado.** Hacer el `pg_dump` (2.1) y **probar el restore en una base
   temporal** antes de vaciar nada.

### 1.2 Pendientes urgentes para el martes (en orden)

- [ ] **Decidir el alcance del borrado** (1.1) y dejarlo por escrito en este archivo.
- [ ] **Conseguir los Excel más recientes de cada cliente** (tabla 3.2) y confirmar la fecha de corte
      (idealmente cada archivo del jueves/viernes). Avisar al equipo que **no edite los Excel** después
      del corte.
- [ ] **Respaldo + prueba de restore** (2.1).
- [ ] **Migración completa** el sábado/domingo/lunes (2.3), con verificación por cliente (2.4).
- [ ] **Permisos por usuaria** (sección 8): al 2026-11-20 faltaban clientes a varias usuarias.
- [ ] **Carga final (delta) el martes temprano** con el Excel tal como quedó el lunes (los scripts son
      repetibles; ver 2.3).
- [ ] **Avisar al equipo** qué se migró, hasta qué fecha y cómo reportar diferencias.
- [ ] Rotar la `ANTHROPIC_API_KEY` del asistente (el usuario dijo que era una clave de prueba).

---

## 2. Plan de migración completa (runbook)

> Regla del proyecto: **no pushear, desplegar ni escribir en la base de producción sin pedido explícito
> del usuario en ese momento.** Todo lo de abajo se ejecuta cuando el usuario lo pide.

### 2.1 Antes de empezar

```bash
ssh root@162.243.216.6                      # Droplet "dg-platform-prod"
mkdir -p /root/backups && cd /root/backups
# Respaldo de las DOS bases (la operativa y la de usuarios/permisos)
sudo -u postgres pg_dump -Fc dg_platform_excel > excel-pre-migracion-completa-$(date +%Y%m%d-%H%M).dump
sudo -u postgres pg_dump -Fc dg_platform       > main-pre-migracion-completa-$(date +%Y%m%d-%H%M).dump
cp /opt/dg-platform/.env env-pre-migracion-completa-$(date +%Y%m%d)
ls -la /root/backups | head   # verificar que pesan ~65 MB la operativa
```

- Probar el restore en una base temporal (no en la real):
  `createdb dg_restore_test && pg_restore --no-owner -d dg_restore_test <dump>` y contar filas de
  `egresos` y `tango_ingresos`. Borrar la base temporal después.
- Ya existe respaldo automático diario (3:00 ART) en `/root/backups/auto` con 14 días de retención.
- Subir los Excel a una carpeta del servidor (p. ej. `/root/imports/migracion-20261120/`) y correr los
  scripts desde `/opt/dg-platform` con `npx tsx scripts/...` (la base no está expuesta; no abrir túnel).
- **Pausar escrituras mientras se migra:** avisar que nadie cargue datos, o dejar la app en mantenimiento
  (`pm2 stop dg-platform`) durante el borrado y la carga; reactivar con `pm2 start dg-platform`. **Ojo:** con la app parada el conector de Tango (6:00 ART) y el stock de Urbano no pueden reportar: reactivarla antes de las 6:00 del día siguiente.

### 2.2 Qué se reemplaza y qué se conserva (base `dg_platform_excel`)

**Se reemplaza desde Excel** (datos de origen Excel):

| Tabla | Nota |
|---|---|
| `base_categorias`, `base_proveedores`, `marcas`, `base_clientes` | Catálogos. Mantener los **nombres** de clientes (los permisos de usuarias usan el nombre). |
| `base_productos` | **Actualizar y agregar** (no borrar): conserva `imagen_url` y `descripcion` editadas en la plataforma. |
| `base_codigo_cliente` | Códigos cliente + código único + vigencia. |
| `base_precios` | Listas de precios históricas. |
| `base_config_tasas_clientes` | 5 tasas por cliente (vigencia 2024-01). |
| `base_estructura_costos_santander` | Es multicliente pese al nombre (Umiles, Santander, Pampa, Producteca). |
| `criterios_flete` | Por producto, no por cliente (limitación conocida). |
| `base_stock_santander` | "Stock informado" por cliente (hoy solo Amex y Umiles). |
| `egresos` (filas de origen Excel) | Ver advertencia abajo. Tablas hijas: `egresos_raw_backup`, `egresos_lotes_importacion`. |
| `tango_ingresos` con `created_by LIKE 'migracion-excel-%'` | Ajustes manuales de planilla (pendientes de Tango). |
| `tango_client_code_map` | Referencia histórica código→cliente (10.207 filas, incluye altas desde planillas). |

**Se conserva siempre** (de la plataforma, de Tango o de integraciones):

`tango_ingresos` (filas sincronizadas con `external_key`), `tango_sync_jobs`, `tango_sync_batches`,
`tango_connector_state`, `tango_oc_pendientes`, `tango_clientes`, `pasaje_requests`, `pasaje_lotes`,
`ajuste_requests`, `urbano_shippers`, `urbano_stock_cargas`, `urbano_stock_items`, `urbano_movimientos`,
`supplier_mail_contacts`, `supplier_mail_logs`, `configuracion`, `migraciones_codigo_cliente`,
`egresos_cambios_producto`, `egresos_perfiles_importacion` y toda la base **`dg_platform`** (usuarios,
permisos, auditoría).

**Advertencia sobre `egresos`:** conviven filas de origen Excel (`created_by LIKE 'migracion-%'` o con
`raw_row_id`) y filas creadas en la plataforma (pasajes confirmados, canjes importados desde la app,
`created_by` = nombre de usuario). Antes de borrar, correr una consulta que cuente cada grupo por cliente y
**borrar/dar de baja solo las de origen Excel**. Los scripts de stock usan baja lógica
(`deleted_at`/`deleted_by = 'migracion-excel-<cliente>'`), que es reversible; preferirla a `DELETE`.

### 2.3 Orden de carga y scripts

Cada script tiene `--dry-run`: **correr siempre primero en seco** y revisar los números. Todos están en
`scripts/` y usan `EXCEL_DATABASE_URL` del `.env` del servidor.

| # | Paso | Script / comando |
|---|---|---|
| 1 | Catálogos, productos, precios, tasas (carga base inicial) | `npm run data:migrate:dry` y `npm run data:migrate` (`migrate-excel-to-postgres.ts`; fuentes en `local-data/BASE DE DATOS DG/En uso`, que son de **septiembre**: no sirven sin actualizarlas. **No se probó contra el esquema actual** —se agregaron ~20 migraciones desde que se escribió—: correr siempre en seco y comparar antes; si falla o no cubre algo, usar los scripts por cliente de los pasos siguientes) |
| 2 | Productos y precios nuevos desde la base maestra | `import-productos-precios-maestra.ts "<xlsx/xlsm con hojas DB_Producto y DB_Precios>"` (los CSV se convierten antes a .xlsx con las dos hojas como texto) |
| 3 | Productos que solo aparecen en planillas | `import-productos-faltantes-planilla.ts "<4- Stock X.xlsm>"` |
| 4 | Códigos cliente de todos los clientes | `import-codigos-clientes.ts "<DB_Clientes 1.csv>" [--clientes=A,B] [--vigente-desde=AAAAMM] [--sincronizar-vigencia]` |
| 5 | Estructura de costos | Umiles: `import-cost-structure-umiles-historical.ts <actual.xlsm> <historia.xlsx>`; Santander: `import-cost-structure-santander-historical.ts`; Pampa: `import-cost-structure-pampa.ts`. **Faltan** Credicoop, Amex, Massalin, HSBC, Syngenta, Producteca, Importados |
| 6 | Egresos + ingresos manuales + códigos por planilla | `import-stock-planilla-cliente.ts <pampa\|credicoop\|amex> "<4- Stock X.xlsm>" [--fecha=] [--sin-pasajes-del=AAAA-MM-DD] [--reemplazar-egresos] [--ingresos-por-fila] [--egresos-extra=<Egresos X_DB.xlsx>] [--dry-run]` |
| 7 | Umiles: egresos, ingresos y stock informado | `import-egresos-umiles-delta.ts "<3 - Ingresos y Egresos Umiles.xlsm>"`, `import-ingresos-umiles-planilla.ts "<4- Stock Umiles.xlsm>"`, `import-stock-informado-umiles.ts "<4- Stock Umiles.xlsm>"` (esta última actualiza y agrega, no borra; `--reemplazar` borra) |
| 8 | Santander (egresos históricos) | `import-egresos-santander-historical.ts "<xlsx>"` (pasa por el circuito genérico con deduplicación) |
| 9 | Amex: OFED y stock informado | `import-amex-ofed-informado.ts "<4- Stock AMEX.xlsm>" [--vigente-desde=AAAAMM]` |
| 10 | Contactos de proveedores | `import-contactos-proveedores.ts "<Proveedores.xlsx>"` |
| 11 | Stock de Urbano | Se actualiza solo (cron 7:00 ART, `sync-urbano-stock.ts`); no hace falta cargarlo |
| 12 | Ingresos de Tango | Llegan solos todos los días 6:00 ART por el conector (PC `DFS01`); no cargar planillas de ingresos en `tango_ingresos` salvo los ajustes `migracion-excel-*` de arriba (ver reglas, sección 6) |

Notas de uso conocidas:
- **Pampa:** al repetir, pasar `--sin-pasajes-del=2026-10-29` (esos 17 pasajes se cargan por la pantalla
  Pasajes; si no, se duplican).
- **Credicoop:** `--reemplazar-egresos --ingresos-por-fila` (los egresos viejos tenían el IdRedencion como
  código y se dieron de baja; los nuevos usan el IdRecompensa).
- **Amex:** `--egresos-extra="Egresos Amex_DB.xlsx"`; los datos personales de los canjes no se cargan.
- **Umiles:** el Excel de egresos trae filas exactamente repetidas (mismo Nº Seg): el script las descarta.
  El perfil de importación de egresos de Umiles en la base ya no sirve para ese Excel (hoy está armado para
  el reporte de canjes de Urbano); por eso el script de Umiles escribe directo.
- Los ajustes manuales con `pending_tango_entry = false` y sin `external_key` **hacen fallar la
  sincronización de Tango**: todo ajuste de planilla debe quedar `pending_tango_entry = true`.
- Si un script falla a la mitad, **no reintentar a ciegas**: leer el error, ver qué quedó escrito y recién
  ahí decidir (la mayoría tiene transacción, pero los de egresos por circuito genérico dejan un lote).

### 2.4 Verificación (criterios de aceptación)

Para **cada cliente** comparar plataforma vs su Excel y anotar el resultado en la sección 4:

- [ ] Egresos: cantidad de filas y **fecha del último egreso** (la del Excel).
- [ ] Códigos cliente: vigentes totales y por cliente (comparar contra `DB_Clientes 1`).
- [ ] Stock por código: pantalla Stock vs hoja "STOCK REAL" de la planilla (diferencias explicadas o 0).
- [ ] Ingresos físicos por código vs planilla (los ajustes `migracion-excel-*` deben cerrar la diferencia).
- [ ] Estructura de costos del cliente: abre y muestra productos, con su período más reciente.
- [ ] Precios: último período cargado por proveedor/producto.
- [ ] Ingresos: la columna Cliente ya no muestra demasiados "Sin asignar" para el mes en curso.
- [ ] Permisos: cada usuaria entra y ve **solo** sus clientes (Pasajes aparte).
- [ ] Pasajes: crear uno de prueba entre dos clientes, aprobar, confirmar y revisar que mueve el stock
      (y **borrar el de prueba**).
- [ ] Cron de Tango/Urbano/alertas siguen activos (sección 7).

### 2.5 Reversa

Si la migración sale mal y no se puede arreglar antes del martes:

```bash
pm2 stop dg-platform
sudo -u postgres pg_restore --clean --if-exists --no-owner -d dg_platform_excel /root/backups/<dump-pre-migracion>.dump
pm2 start dg-platform --update-env
```

Probar este comando en la base temporal **antes** de necesitarlo. Después del restore, verificar los
conteos de la sección 4 y que el conector de Tango siga reportando (Ingresos muestra "Conector automático").

---

## 3. Fuentes de datos

### 3.1 Dónde están los Excel

- Los Excel reales **no se versionan** (`local-data/` está en `.gitignore`). Los más nuevos están en el
  Drive del equipo (zips) y en la carpeta Descargas del usuario.
- `local-data/BASE DE DATOS DG/En uso/` tiene las bases originales (`Base Productos DG.xlsx`, `Base Codigo
  Cliente DG.xlsx`, `Base Precios DG.xlsx`, `Base Egresos <cliente> DG.xlsx`, etc.) **del 17/09/2026 y
  anteriores**: no son la última versión.
- Informes de comparación de Umiles en `local-data/migracion-umiles/`.

### 3.2 Estado por cliente (foto de producción al 2026-11-20)

| Cliente | Egresos (filas · último) | Códigos (vigentes/total) | Costos cargados | Stock informado | Origen de los datos / pendiente |
|---|---|---|---|---|---|
| Santander | 270.244 · **28/09** | 286 / 564 | 2.243 filas (2025-11 a 2026-09) | no | **Egresos desactualizados.** El stock real total daba negativo (−84.895 el 2026-10-08, por egresos históricos contra ingresos de Tango; no se revisó desde entonces). Falta el Excel nuevo. |
| Credicoop | 147.889 · 10/11 | 894 / 2.140 | no | no | Planilla "4- Stock Credicoop" (hojas `ACT- EGRESOS (nv)`, `ACT- INGRESOS (nv)`, `Credicoop`). Pendiente sin entregar: códigos 3579, 3497, 4750. |
| Amex | 56.928 · 05/11 | 312 / 4.087 | no | 2.087 | "4- Stock AMEX" + "Egresos Amex_DB". Pendiente: AMEX CENTURIN, 42 OFED sin código único, Urbano sin código (PLATINUM-0001), estructura de costos de la planilla, Amex Futuro. |
| Pampa | 26.388 · 19/11 | 95 / 1.190 | 1.416 (2025-08 a 2026-11) | no | "4- Stock Pampa", "Egresos Pampa_DB", "2- Estructura de costo Pampa". |
| HSBC | 12.730 · **03/04** | 261 / 436 | no | no | **Desactualizado.** |
| Massalin | 7.946 · 16/11 | 146 / 1.093 | no | no | 101 códigos vigentes que no figuran en el período 2026-11 del archivo (no se sincronizó). |
| Umiles | 5.997 · 17/11 | 475 / 495 | 3.684 (2025-01 a 2026-09) | 427 | "1 - Consulta Base de datos", "2- Estructura de costo", "3 - Ingresos y Egresos", "4- Stock", `DB_Clientes 1.csv`, `DB_Precios 1.csv`. Faltan costos nov-dic 2025. |
| Syngenta | 4.118 · **24/06** | 50 / 317 | no | no | **Desactualizado.** |
| Producteca | 3.421 · **28/06** | 403 / 788 | 1 fila | no | **Desactualizado.** |
| Importados | 644 · **25/06** | 15 / 96 | no | no | **Desactualizado.** |
| Macro, Provincia, Comafi, CTC, Supervielle, Amex Futuro | n/a | Macro 3/9, Provincia 1/1 | no | no | **No existen en la tabla Clientes de producción**: sus códigos del Excel no se cargaron. Macro tiene pasajes hacia Umiles. |

Catálogos: 2.885 productos (2.844 activos), 163 proveedores, 18 categorías, 10 clientes, 31.424 precios.
Tasas: 5 por cliente (los 10 clientes), vigencia 2024-01 (las variantes 2026-07 de Amex/Massalin/Credicoop
que existen en local **no** están en producción).

---

## 4. Estado actual de producción (foto 2026-11-20)

- **Versión desplegada:** `0e4c443` ("Clientes asignados: fuera de Pasajes cada usuario ve solo sus clientes")
  = `main` local = `new-origin/main`. Árbol de trabajo local limpio salvo `.claude/launch.json` y la
  carpeta `ejemplos-pasajes/` (sin versionar; no la sumes al repositorio sin preguntar).
- **Servidor:** Droplet `dg-platform-prod`, app en `/opt/dg-platform` (PM2 `dg-platform`, ~2 h de uptime),
  Postgres nativo, bases `dg_platform_excel` (operativa) y `dg_platform` (usuarios). Disco 24 % usado.
- **Tango:** `tango_ingresos` 141.238 filas, 2012-02-07 a 2026-11-19 (12.937 manuales). Manuales por
  origen: credicoop 7.965, amex 3.609, pampa 965, umiles 379, Urbano 14, usuarios 5.
- **Pasajes:** 17 confirmados, 1 rechazado. **Urbano:** 26 cargas de stock, 30.570 items, 5.103
  movimientos, 10 shippers. **Contactos de proveedores:** 43. **Egresos dados de baja:** Credicoop
  129.182, Pampa 37, Umiles 3.
- **Respaldos disponibles** (`/root/backups`): automáticos diarios (14 días) y manuales del 16 al 20/11,
  entre ellos `dg_platform_excel-antes-borrar-sin-destino-20261119.dump` (65 MB).
- Completar acá, después de migrar, la tabla de conteos por cliente (sección 2.4).

---

## 5. Pendientes y riesgos conocidos (no bloquean el martes salvo que se indique)

**Generales**
- Sin Tango: el conector corre en la PC `DFS01` (tarea 6:00 ART, permiso "Log on as a batch job" ya
  otorgado). Si deja de reportar, Ingresos muestra un cartel naranja pasadas 30 h.
- Tango carga ajustes "no valorizados" en bloque; si lo hace para un cliente migrado desde planilla
  **cuenta doble**. Revisar después de cada ajuste masivo de Tango (ver sección 6).
- `ANTHROPIC_API_KEY` del asistente es de prueba: rotarla.
- Urbano: la API de productos/movimientos solo responde en el entorno QA (se usa como producción por
  decisión del usuario); falta pedir la de producción. La clave la maneja el de IT.
- Productos duplicados detectados: `lq-hm200m` y `lqe73/lq-hm200m` (microondas Lüsqtoff).
- Pantalla Códigos cliente desactiva el código anterior al asignar uno nuevo al mismo producto.
- Ingresos: ~84 % de las filas históricas quedan como "Sin asignar" (códigos viejos de 2012-2018 que no están
  en ninguna tabla); lo reciente sí se asigna. Propuesta pendiente: reglas por prefijo del código
  (`CREDI`→Credicoop, `DIR`→Santander, `PROD`→Producteca, etc.) o un Excel con los códigos recientes.
- Estructura de costos: faltan nov-dic 2025 de Umiles; 8 códigos con dos PVC en el mismo mes; 20 códigos
  `URB-` vigentes sin precio; 6 productos nuevos de Umiles sin precio (`hp660negro`, `blastgo`,
  `watch2pro`, `solar2lite`, `soundpocketessential`, `redmibuds6play`).
- Umiles: 15 egresos PASAJE sin código único (`DIR…` del 15/04 y `REC-0686`); 5 códigos con diferencia de
  ingreso respecto de la planilla (`URB-066` +14, `URB-392` +15, `URB-212` +4, `URB-326` +4, `URB-150` +3).
- Stock: el cálculo de Stock usa los egresos `ROBO_AJUSTE` (antes los ignoraba por el nombre con guion
  bajo); para Umiles cuenta los "Ajuste (no) valorizado" de Tango como ingreso.

---

## 6. Reglas y decisiones tomadas (no volver a discutirlas sin avisar)

- **Ingresos = Tango.** `base_ingresos` está vacía y ninguna pantalla la lee; las planillas de ingresos
  **no** se cargan en `tango_ingresos` salvo ajustes `ROBO/AJUSTE` firmados `migracion-excel-<cliente>` y
  con `pending_tango_entry = true`, para igualar el stock de la planilla.
- **Umiles:** Tango **no** debe cargar más ajustes en bloque; los pasajes se registran en el módulo
  Pasajes. Para revertir lo migrado: borrar filas de `tango_ingresos` con `created_by = 'migracion-excel-umiles'`.
- **Cliente de un ingreso:** sale del código cliente (Códigos cliente activos → referencia histórica →
  "Sin asignar"). Nunca del depósito de Tango.
- **Stock Urbano** = Cant. Física de todos los estados (como la planilla). "Stock Informado" es el ingreso
  físico informado a la web, otra cosa.
- **Pasajes:** estados pendiente → aprobado → confirmado; el egreso del origen se ejecuta al confirmar con la
  cantidad real; si confirma menos, la diferencia queda como egreso "ROBO/AJUSTE". Se generan desde cualquier
  cliente y aprueba quien tiene el destino.
- **Clientes asignados:** fuera de Pasajes, cada usuario no ADMIN ve solo los clientes de su lista
  (`User.pasajeClients`); ADMIN ve todo; `pasajes_todos` (encargada) amplía solo Pasajes.
- **Deploy:** nada a producción sin pedido explícito; el orden correcto está en la sección 7.
- Los scripts de importación se corren **en el servidor**; antes de cada carga, respaldo con nombre y fecha.

---

## 7. Operación (sin secretos)

- **Acceso:** `ssh root@162.243.216.6` con la llave del usuario. Las contraseñas y claves viven solo en
  `/opt/dg-platform/.env` (y `local-data/private/`); **no copiarlas a este repositorio**.
- **Deploy** (solo cuando el usuario lo pida): `git pull --ff-only origin main` → si cambió
  `prisma/excel-migration.prisma`, **antes del build** `npx prisma generate --schema prisma/excel-migration.prisma`
  → `npm run build` → recargar solo si el build terminó bien: `pm2 reload dg-platform --update-env`.
  Si el build falla después de `rm -rf .next`, la app queda caída: no borrar `.next` hasta estar seguro.
- **Migraciones SQL** de la base operativa: se aplican a mano (no hay tabla `_prisma_migrations` ahí):
  `psql "${EXCEL_DATABASE_URL%%\?*}" -v ON_ERROR_STOP=1 -1 -f prisma/excel-migrations/<carpeta>/migration.sql`.
- **Cron en el servidor (hora UTC):** pedido de catálogo a proveedores `0 17` (14:00 ART, primer día hábil
  del mes); stock de Urbano `0 10` (7:00 ART); respaldo diario `0 6` (3:00 ART); control de avisos `0 11`
  (8:00 ART).
- **El servidor no tiene Git LFS:** archivos `*.xlsx/*.xls/*.pdf` que la app lea en runtime llegan como
  punteros; las plantillas van en `templates/**` (excluido de LFS).
- **Correo:** sale por un puente de Google Apps Script (DigitalOcean bloquea el SMTP). Detalle en
  `docs/apps-script/puente-correo.gs`.
- **Pruebas locales:** `npm test`, `npx tsc --noEmit`, `npm run lint`. La base local (Docker) suele estar
  desactualizada: **diagnosticar siempre contra producción** (solo lectura) antes de cargar.

---

## 8. Equipo y permisos (para el martes)

Equipos según el usuario: **Alejandra y Betiana** → Credicoop, Amex, Massalin · **Mercedes (Mechi) y
Natalia** → Pampa y Producteca · **Liz y Emilia** → Umiles y Santander. Juan Martín es ADMIN.

Estado de producción al 2026-11-20 (verificar en Permisos, puede haber cambiado):
- [ ] Ale: solo Amex → **faltan Credicoop y Massalin**.
- [ ] Betiana: Amex, Massalin, Credicoop (completo).
- [ ] Emilia: Santander y Umiles (completo).
- [ ] Liz: solo Umiles → **falta Santander**.
- [ ] Natalia: Pampa y Producteca (completo).
- [ ] Rosario: sin clientes (solo Correos).
- [ ] **Mercedes: no tiene usuario creado.**

Los módulos Productos, Precios, Proveedores y Correos son globales (no tienen cliente).

---

## 9. Registro de cambios de este archivo

| Fecha | Cambio |
|---|---|
| 2026-11-20 | Creación. Foto de producción, plan de migración completa, riesgos del borrado y pendientes urgentes para el martes 24/11. |
