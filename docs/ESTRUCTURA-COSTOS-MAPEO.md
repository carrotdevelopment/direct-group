# Estructura de costos: origen, fórmulas y validación

## Referencia anterior independiente del selector

Las cuatro columnas claras (Fecha PVC ant, Flete ant, PVC sin IVA ant y PVC
con IVA ant) ahora usan `previousAdjustment`: el ajuste guardado de mayor
período de cada producto, sin acotarlo al selector. Los cuatro valores salen
de la misma fila persistida. Flete ant ya no se recalcula con criterios de
flete. Sin ajuste guardado se muestra un guion. Esto reemplaza las reglas de
referencia anterior descriptas en el relevamiento inicial más abajo.

Las columnas editables conservan su consulta por período. Guardar actualiza
la referencia de la fila modificada si corresponde al último período; una
edición de un período más antiguo no desplaza la referencia más reciente.
La fecha es la vigencia mensual registrada, no un timestamp de auditoría.

Validación: 51 pruebas aprobadas, tipos y lint correctos. Se repitió el
recorrido en Chrome con datos simulados, incluyendo cambio de período y
comparación de las cuatro celdas anteriores antes/después.

## Ajustes de interfaz del 9 de septiembre de 2026

- Encabezados de importes con tooltip de fórmula o procedencia.
- Fecha PVC por fila: conserva el período guardado salvo que esa fila cambie;
  tras guardar se confirma el período únicamente en las filas enviadas.
  Deshacer una edición antes de guardar recupera el período anterior.
- Los cambios de criterio de flete se detectan aunque el importe sea igual.
- Detalle expandido con costo DG, flete, cargos, utilidad e IVA, y advertencia
  cuando el PVC con IVA almacenado difiere de la alícuota actual.
- Cliente seleccionado recordado en el navegador, validado contra los clientes
  disponibles al volver a la página.
- Flete por categoría/destino: sigue pendiente la definición comercial con
  Gra, Juan y Negro (tarifas, destinos y tratamiento de IVA). Se conserva el
  criterio por producto existente; no se inventó una matriz de tarifas.

Las pruebas automatizadas ahora incluyen vigencia por fila, confirmación del
guardado y cambios de criterio de flete sin cambio de importe.

Relevamiento e implementación del punto 1.a, 8 de septiembre de 2026.
Alcance: estructura Santander. PostgreSQL es la única fuente operativa.
No se modificaron datos reales ni se recalcularon períodos guardados en bloque.

## Recorrido de los datos

`base_codigo_cliente` define las filas de Santander. Se descartan asignaciones
anuladas y posteriores al mes consultado; por código único se conserva la de
mayor año/mes. Se cruza ese código con `base_productos.codigo_unico` (el adaptador
lo expone como `code`), `base_precios.codigo_unico`,
`base_estructura_costos_santander.codigo_unico` y `criterios_flete`.

La estructura guardada de referencia es la más reciente cuyo año/mes no supera
el consultado. Cada campo de precios se busca independientemente: último dato
válido por año, mes y día, hasta el mes seleccionado inclusive. Por ello costo,
IVA, precio público y markup pueden venir de fechas distintas. No se usa un
precio de meses futuros. La selección es mensual, no por día de consulta.

## Mapeo de columnas y campos

| Columna / dato | Fuente física PostgreSQL | Regla y respaldo |
|---|---|---|
| Cliente | `base_codigo_cliente.cliente` | Santander; el selector se alimenta de `base_clientes`. |
| Código cliente | `base_codigo_cliente.codigo_cliente` | Última asignación no anulada hasta el período. |
| Código único / ID de fila en pantalla | `base_codigo_cliente.codigo_unico` | Clave de cruce del producto; no es el ID físico del registro de costos. |
| Activo / inactivo | `base_codigo_cliente.activo` | Estado almacenado de la asignación seleccionada. |
| Producto | `base_estructura_costos_santander.producto` | Si está vacío, nombre del producto activo en `base_productos`. |
| Proveedor | `base_estructura_costos_santander.proveedor` | Si está vacío, proveedor en `base_productos`. |
| Categoría | `base_estructura_costos_santander.categoria` | Si está vacía, categoría en `base_productos`. |
| Fecha costo | `base_precios.anio/mes/dia` | Fecha del último costo proveedor positivo encontrado. No acredita la fecha de adopción del costo guardado. |
| Costo DG sin IVA | `base_estructura_costos_santander.costo_dg_sin_iva` | Si es positivo, se conserva. Si no, último `base_precios.costo_dg` positivo; sin datos, cero. |
| Último costo proveedor / alerta | `base_precios.costo_dg` | La alerta aparece si ambos costos son positivos y difieren más de $0,01. Adoptar el precio es una acción del usuario. |
| PP con IVA | `base_precios.precio_publico` | Último positivo; respaldo en `base_estructura_costos_santander.precio_publico`, después cero. |
| IVA | `base_precios.iva` | Último valor no negativo presente. Cero es válido; NULL no lo es. Respaldo: IVA guardado, después 21 %. |
| Markup | `base_precios.mark_up` | Último valor no negativo presente. Cero es válido. Respaldo: markup guardado, después cero. No interviene directamente en la fórmula de ganancia. |
| PP sin IVA | Calculado | PP con IVA / (1 + IVA / 100). Se guarda en `pp_sin_iva`. |
| Fecha PVC anterior | `base_estructura_costos_santander.periodo` | Período de la estructura de referencia. El campo de API se llama `pvcUpdatedAt`; anteriormente se llamaba engañosamente `publicPriceUpdatedAt`. No es la fecha del precio público. |
| PVC sin / con IVA anterior | `base_estructura_costos_santander.pvc_sin_iva/pvc_con_iva` | Valores de referencia al cargar; pueden ser del mismo período si ya estaba guardado. |
| Flete anterior | Referencia cargada en pantalla | Incluye el criterio de flete vigente aplicado al cargar; no siempre es el importe histórico puro. |
| Fecha PVC actual / vigencia | Mes/año seleccionado | Define el período que se consulta y guarda. |
| Flete sin IVA | `criterios_flete` | Último criterio vigente por código: monto fijo o porcentaje del costo DG aplicado. Sin criterio, flete guardado; después cero. Editable. |
| PVC sin IVA actual | Estructura guardada y edición/propuesta | Inicia con el valor de referencia, o cero. El usuario puede editarlo o proponerlo por rentabilidad. |
| PVC con IVA actual | Estructura guardada y edición/propuesta | Al editar PVC sin IVA se multiplica por (1 + IVA / 100); al editar con IVA se hace la inversa. |
| Tasas sobre costo / precio | `base_config_tasas_clientes` | Se vincula `cliente_id` con el cliente mediante el adaptador. Se elige el grupo de mayor `vigente_desde` hasta el período y solo conceptos con `aplica = true`. |
| Seguro | Cálculo de la tasa con `clave = seguro` | La base depende de `aplica_sobre`; se persiste en `seguro`. |
| Ingresos brutos | Tasa `ingresos_brutos` | Se persiste en `ingresos_brutos`. |
| Impuesto débito / crédito | Tasas `impuesto_debito` / `impuesto_credito` | Se persisten en sus columnas homónimas. |
| Impuesto Misiones | Tasa `impuesto_misiones` | Se persiste en `impuesto_misiones`. |
| Otros conceptos configurados | `base_config_tasas_clientes` | Participan del desglose en pantalla y del costo total, aunque no tengan una columna individual en la tabla histórica. |
| Costo total | Calculado | Costo DG + flete + suma de todos los cargos habilitados. Se guarda en `costo_total`. |
| Ganancia $ | Calculado | PVC sin IVA − costo total. Se guarda en `utilidad`. |
| Ganancia % | Calculado | Ganancia / costo total × 100; cero si costo total es cero. Se guarda en `porcentaje`. Es rentabilidad sobre costo, no margen sobre venta. |
| Historial PVC | `base_estructura_costos_santander` | Desglose de hasta tres registros por período hasta el consultado. La búsqueda histórica separada muestra todos los períodos coincidentes. |
| Stock / segmento inactivo con stock | Valor provisional | Este endpoint aún usa stock = 0; no se cambió Stock en este trabajo. |
| Costo actualizado | `costo_actualizado` | Marca `OK` si fecha costo y período PVC de referencia coinciden con el período guardado. No constituye una validación integral de la fila. |
| Peso volumétrico / bultos / origen | `peso_volumetrico/bultos/origen` | El guardado normal actual escribe 0 / 0 / WEB. No intervienen en las fórmulas actuales. |

## Una sola fórmula para pantalla y guardado

`lib/cost-structure-calculation.ts` es compartido por el componente y la API.
Se redondea cada cargo a dos decimales antes de sumar; costo total, ganancia,
porcentaje y precio propuesto también se redondean a dos decimales.

- Cargo sobre costo = costo DG sin IVA × porcentaje / 100.
- Cargo sobre precio = PVC sin IVA × porcentaje / 100.
- Costo total = costo DG sin IVA + flete sin IVA + cargos.
- Ganancia = PVC sin IVA − costo total.
- Rentabilidad % = ganancia / costo total × 100.
- Propuesta de PVC sin IVA = A × (1 + p) / [1 − R × (1 + p)], donde
  A = costo DG × (1 + suma de tasas sobre costo) + flete,
  R = suma de tasas sobre precio y p = rentabilidad objetivo (en fracciones).
  Si el denominador no es positivo/finito no hay propuesta válida.

El servidor lee las tasas de PostgreSQL para el período enviado; no acepta
tasas propuestas por el navegador ni aplica porcentajes fijos de respaldo.
Sin configuración vigente, no hay cargos configurados (igual que en pantalla).
La edición del historial usa las tasas del período de esa fila y actualiza
solo esa fila. Consultar no modifica los importes históricos almacenados.

## Ejemplo comprobado

Costo DG = 100; flete = 10; PVC sin IVA = 200; IVA = 21 %;
PP con IVA = 242; cargo sobre costo = 2 %; cargo sobre precio = 5 %.

Resultado: PP sin IVA = 200; cargos = 2 + 10; costo total = 122;
ganancia = 78; rentabilidad = 63,93 %. La API guarda los mismos resultados
que el cálculo compartido de pantalla, incluyendo conceptos personalizados.

## Validaciones y límites

Pruebas automatizadas en `tests/cost-structure-calculation.test.ts` y
`tests/cost-structure-api.test.ts`: importes conocidos, redondeo por cargo,
IVA cero vs. NULL, markup cero, tasas históricas, tasas inactivas/otro cliente,
ausencia de configuración, cargos personalizados, propuesta imposible,
asignaciones futuras/anuladas y guardado/edición histórica con base simulada.

Resultado de ejecución: 33 pruebas aprobadas en 10 archivos; typecheck, lint,
generación de Prisma y build aprobados. Comprobación local de solo lectura:
health PostgreSQL, API de costos y página de estructura respondieron HTTP 200;
septiembre de 2026 devolvió 218 filas, sin valores no numéricos en costo DG,
IVA, precio público, flete y PVC sin IVA. Esto no equivale a una conciliación
comercial de cada importe ni a una prueba visual de navegador.

No se reconstruye el estado histórico completo del maestro: activo y textos
de respaldo dependen del estado almacenado actual. Tampoco se guardan snapshots
de cada concepto/tasa personalizado: modificar una configuración histórica
puede cambiar el cálculo al volver a editar ese período. La tabla de precios
conserva la diferencia entre NULL y cero para IVA/markup; la adaptación de
estructuras antiguas todavía convierte NULL numérico a cero.

La fecha mostrada como “Fecha costo” es del precio proveedor disponible, no
necesariamente del costo aplicado. La decisión de adoptar automáticamente
precios nuevos, capturar snapshots de tasas o ampliar trazabilidad visual
requiere trabajo adicional; no se cambiaron esas reglas comerciales.
