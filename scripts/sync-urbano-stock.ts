import { createPasajesFromUrbano, reconcilePasajesWithUrbano } from "@/lib/pasajes-ajustes-db";
import { urbanoApiConfig } from "@/lib/urbano-api";
import { syncUrbanoMovements, syncUrbanoStock } from "@/lib/urbano-stock-db";

// Uso (en el servidor, todos los días desde cron):
//   set -a && . ./.env && set +a && DG_DATA_SOURCE=postgresql npx tsx --conditions=react-server scripts/sync-urbano-stock.ts
// Trae el stock de Urbano y lo guarda como carga del día (reemplaza la de hoy). Con la API configurada trae
// todas las cuentas y también los movimientos; si no, el reporte "Stock en línea" del portal de clientes.
const stamp = () => new Date().toISOString();
const message = (error: unknown) => (error instanceof Error ? error.message : error);

async function main() {
  let failed = false;
  try {
    const result = await syncUrbanoStock("Sincronización automática");
    console.log(
      `${stamp()} Stock OK. ${result.saved} códigos, física total ${result.totalQuantity}` +
        `${result.withoutClient ? `, ${result.withoutClient} sin código cliente` : ""}${result.replaced ? ", reemplazó la carga de hoy" : ""}.`,
    );
  } catch (error) {
    failed = true;
    console.error(`${stamp()} ERROR en stock`, message(error));
  }
  // Un error en el stock no frena los movimientos: son consultas independientes.
  if (urbanoApiConfig()) {
    try {
      const result = await syncUrbanoMovements();
      console.log(`${stamp()} Movimientos OK. ${result.received} recibidos, ${result.saved} nuevos${result.skipped ? `, ${result.skipped} sin poder leer` : ""}.`);
    } catch (error) {
      failed = true;
      console.error(`${stamp()} ERROR en movimientos`, message(error));
    }
    // Aunque falle la carga de hoy, los movimientos ya guardados pueden crear y confirmar pasajes.
    try {
      const result = await createPasajesFromUrbano();
      console.log(`${stamp()} Pasajes nuevos desde Urbano: ${result.created}${result.matched ? `, ${result.matched} vinculados a pasajes cargados a mano` : ""}${result.withoutCode.length ? `, ${result.withoutCode.length} salidas sin código cliente` : ""}${result.failed.length ? `, ${result.failed.length} con error` : ""}.`);
      if (result.withoutCode.length) console.log(`${stamp()} Salidas de pasaje sin código cliente (se reintentan): ${result.withoutCode.join(", ")}`);
      if (result.failed.length) {
        failed = true;
        console.error(`${stamp()} ERROR al crear pasajes`, result.failed);
      }
    } catch (error) {
      failed = true;
      console.error(`${stamp()} ERROR al crear pasajes`, message(error));
    }
    try {
      const result = await reconcilePasajesWithUrbano();
      console.log(`${stamp()} Pasajes OK. ${result.confirmed} confirmados con Urbano, ${result.toReview} para revisar${result.failed.length ? `, ${result.failed.length} con error` : ""}.`);
      if (result.failed.length) {
        failed = true;
        console.error(`${stamp()} ERROR en pasajes`, result.failed);
      }
    } catch (error) {
      failed = true;
      console.error(`${stamp()} ERROR en pasajes`, message(error));
    }
  }
  process.exit(failed ? 1 : 0);
}

void main();
