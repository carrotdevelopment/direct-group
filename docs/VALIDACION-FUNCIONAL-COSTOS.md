# Validación funcional de estructura de costos

Fecha: 9 de septiembre de 2026.

Actualización: al volver a Costos, la tabla se consulta automáticamente para
el cliente y período recordados. La prueba de navegación y recarga se repitió
sin presionar “Cargar estructura” y pasó. Las respuestas de cargas anteriores
se descartan si el usuario cambia de selección durante una consulta.

Navegador Chrome headless, ventana de 1600 × 1100, perfil aislado.
Página real de desarrollo con respuestas de clientes y costos simuladas en
el navegador. Dos productos ficticios TEST-A y TEST-B. Las escrituras reales
están bloqueadas; la persistencia de la prueba se conserva en sessionStorage.

## Resultado

| Recorrido | Resultado |
|---|---|
| Cargar estructura y consultar títulos de los encabezados de precios, vigencia y utilidad | Aprobado: contienen fórmula o procedencia. Se verificó el atributo nativo `title`; no se capturó el globo del sistema operativo. |
| Expandir detalle de precio final | Aprobado: un único bloque con costo, flete, cargos, utilidad e IVA. |
| Elegir otro cliente, navegar a Egresos y volver a Costos | Aprobado: restaura la selección. |
| Cambiar PVC sin IVA de TEST-A de 200 a 210 | Aprobado: A toma septiembre; B conserva julio. |
| Revertir A a 200 antes de guardar | Aprobado: A recupera julio. |
| Guardar con respuesta HTTP 500 simulada | Aprobado: muestra el error y permite reintentar con los cambios. |
| Confirmar y guardar al reintentar | Aprobado: la petición contiene únicamente TEST-A. |
| Recargar completamente la página y cargar estructura | Aprobado: A conserva septiembre; B julio. |
| Errores JavaScript no controlados durante el recorrido | Ninguno detectado. |

La inspección de la captura detectó un bloque duplicado de explicación con
caracteres incorrectos. Se eliminó la copia defectuosa y se agregó una
aserción de unicidad. El recorrido completo se repitió y pasó.

Después de corregir: 35 pruebas unitarias/API aprobadas, typecheck y lint
aprobados. El guardado real en PostgreSQL no forma parte de esta prueba de
navegador: el comportamiento servidor se cubre con las pruebas de API con
adaptador simulado. No se alteraron precios ni datos de negocio reales.

## Evidencia reproducible

- Script: `dev/validate-cost-ui.mjs`.
- Captura: `dev/cost-ui-functional.png`.
- Encabezados inspeccionados: `dev/cost-ui-headers.json`.

El script requiere el servidor local en puerto 3000 y una instancia aislada
de Chrome headless con depuración remota en puerto 9333. Se ejecuta con
`node dev/validate-cost-ui.mjs`. No requiere Playwright ni dependencias nuevas.
