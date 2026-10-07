import { runMonthlyPriceRequests } from "@/lib/supplier-mail";

// Lo ejecuta cron todos los días: solo envía a partir del primer día hábil del mes
// y una única vez por proveedor activo y por mes.
runMonthlyPriceRequests()
  .then((result) => {
    console.log(`[${new Date().toISOString()}]`, JSON.stringify(result));
    process.exit(result && "failed" in result && result.failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error(`[${new Date().toISOString()}]`, error);
    process.exit(1);
  });
