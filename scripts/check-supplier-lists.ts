import { checkSupplierLists } from "@/lib/supplier-lists";

// cron no carga el .env como lo hace Next: se lee a mano (puente de correo y conexión a la base).
try {
  process.loadEnvFile(".env");
} catch {}

// Lo ejecuta cron cada hora en horario laboral: deja pendientes las listas de precios que llegaron por correo.
checkSupplierLists()
  .then((result) => {
    console.log(`[${new Date().toISOString()}]`, JSON.stringify(result));
    process.exit(result.errors.length ? 1 : 0);
  })
  .catch((error) => {
    console.error(`[${new Date().toISOString()}]`, error);
    process.exit(1);
  });
