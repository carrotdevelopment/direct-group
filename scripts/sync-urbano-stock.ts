import { syncUrbanoStock } from "@/lib/urbano-stock-db";

// Uso (en el servidor, todos los días desde cron):
//   set -a && . ./.env && set +a && DG_DATA_SOURCE=postgresql npx tsx --conditions=react-server scripts/sync-urbano-stock.ts
// Trae el stock de Urbano y lo guarda como carga del día (reemplaza la de hoy): por la API si está
// configurada; si no, el reporte "Stock en línea" del portal de clientes. Los movimientos de Urbano ya no se
// traen: los pasajes se cargan y se confirman a mano en la plataforma.
const stamp = () => new Date().toISOString();
const message = (error: unknown) => (error instanceof Error ? error.message : error);

async function main() {
  try {
    const result = await syncUrbanoStock("Sincronización automática");
    console.log(
      `${stamp()} Stock OK. ${result.saved} códigos, física total ${result.totalQuantity}` +
        `${result.withoutClient ? `, ${result.withoutClient} sin código cliente` : ""}${result.replaced ? ", reemplazó la carga de hoy" : ""}.`,
    );
    process.exit(0);
  } catch (error) {
    console.error(`${stamp()} ERROR en stock`, message(error));
    process.exit(1);
  }
}

void main();
