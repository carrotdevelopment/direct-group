import { checkSupplierReplies, runMonthlyPriceRequests } from "@/lib/supplier-mail";

// cron no carga el .env como lo hace Next: se lee a mano (SMTP_* y conexión a la base).
try {
  process.loadEnvFile(".env");
} catch {}

// Lo ejecuta cron todos los días: solo envía a partir del primer día hábil del mes
// y una única vez por proveedor activo y por mes.
// Después revisa en la casilla qué proveedores contestaron el pedido del mes.
runMonthlyPriceRequests()
  .then(async (result) => {
    console.log(`[${new Date().toISOString()}]`, JSON.stringify(result));
    const replies = await checkSupplierReplies().catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));
    console.log(`[${new Date().toISOString()}] respuestas`, JSON.stringify(replies));
    process.exit(result && "failed" in result && result.failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error(`[${new Date().toISOString()}]`, error);
    process.exit(1);
  });
