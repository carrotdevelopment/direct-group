# PostgreSQL: concurrencia y restricciones de datos

La arquitectura final usa PostgreSQL como fuente de verdad. Mientras la app trabaje con Excel, estas reglas sirven como contrato de destino: las validaciones de UI/API deben apuntar a respetar lo que PostgreSQL va a exigir.

## Principios

- La base de datos es el árbitro final ante cargas simultáneas.
- Las pantallas ayudan al usuario, pero no reemplazan constraints.
- Las APIs deben traducir errores de constraint a mensajes humanos.
- Las escrituras críticas deben usar transacciones Prisma.
- Las ediciones interactivas deben usar optimistic locking.

## Productos

Restricciones preparadas:

- `Product.internalCode` obligatorio y único incluso si cambia mayúsculas/minúsculas o espacios.
- `Product.name` obligatorio.
- `Product.unitsPerPackage` vacío o positivo.
- `Product.version` positivo para control optimista de edición concurrente.
- `Brand.name` y `Category.name` obligatorios y únicos de forma case-insensitive.
- `Supplier.code` y `Client.code` obligatorios y únicos de forma case-insensitive.
- Para un mismo proveedor, `Product.supplierCode` no puede repetirse en productos no archivados.

## Códigos cliente

Restricciones preparadas:

- `ClientProductCode.clientCode` obligatorio.
- `validUntil` debe ser posterior a `validFrom`.
- Para un cliente, un mismo código activo no puede apuntar a dos productos al mismo tiempo.
- Para un cliente, un producto/código único no puede tener dos códigos cliente activos al mismo tiempo.
- Si un producto cambia de código cliente en un período posterior, la relación anterior queda inactiva y se crea una nueva vigente.
- Las correcciones de carga conservan auditoría mediante `changeReason`, `updatedAt` y `updatedBy`.
- Los errores ya guardados no se borran físicamente: se anulan con `voidedAt` y `voidReason`.
- El historial sigue permitido mediante `validFrom` / `validUntil`.

## Cantidades y precios

Restricciones preparadas:

- Movimientos de stock, compras y ventas usan cantidades positivas; la dirección/operación define el sentido.
- Costos, precios e impuestos no pueden tener valores inválidos obvios.
- IVA queda acotado entre 0 y 100.

## Optimistic locking

Cuando la app edite productos en PostgreSQL, el frontend debe recibir:

```ts
{
  id: string;
  version: number;
}
```

Y la API debe actualizar con una condición equivalente a:

```ts
await prisma.product.updateMany({
  where: { id, version },
  data: {
    ...changes,
    version: { increment: 1 },
  },
});
```

Si `count === 0`, otro usuario modificó el producto antes y la API debe responder con conflicto:

```txt
El producto fue modificado por otro usuario. Actualizá la pantalla antes de guardar.
```

## Errores esperados

La API debe mapear errores de PostgreSQL/Prisma:

- `P2002`: duplicado por constraint única.
- `P2003`: relación inválida o referencia inexistente.
- `P2025` / update count `0`: registro inexistente o conflicto de versión.
- Errores `CHECK`: campo inválido según regla de base.
