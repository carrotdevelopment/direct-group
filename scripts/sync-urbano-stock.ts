import { syncUrbanoStockFromPortal } from "@/lib/urbano-stock-db";

// Uso (en el servidor, todos los días desde cron):
//   set -a && . ./.env && set +a && DG_DATA_SOURCE=postgresql npx tsx --conditions=react-server scripts/sync-urbano-stock.ts
// Trae el reporte "Stock en línea" del portal de Urbano y lo guarda como carga del día (reemplaza la de hoy).
syncUrbanoStockFromPortal("Sincronización automática")
  .then((result) => {
    console.log(
      `${new Date().toISOString()} OK. ${result.saved} códigos, física total ${result.totalQuantity}` +
        `${result.withoutClient ? `, ${result.withoutClient} sin código cliente` : ""}${result.replaced ? ", reemplazó la carga de hoy" : ""}.`,
    );
    process.exit(0);
  })
  .catch((error) => {
    console.error(`${new Date().toISOString()} ERROR`, error instanceof Error ? error.message : error);
    process.exit(1);
  });
