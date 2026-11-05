import "server-only";
import https from "node:https";
import type { UrbanoApiMovement, UrbanoApiProduct } from "@/lib/urbano-api-rows";

// API de Urbano para Direct Group: productos con stock y movimientos de todas las cuentas. Urbano la publica
// en su ambiente QA y es la que se usa como producción; si cambia, alcanza con URBANO_API_URL en el .env.
// Usuario y clave: URBANO_API_SHIPPER y URBANO_API_PASSWORD.
const DEFAULT_URL = "https://qa.urbano.com.ar/urbano3/wbs";
const TIMEOUT_MS = 5 * 60_000;

export class UrbanoApiError extends Error {}

export function urbanoApiConfig() {
  const shipper = process.env.URBANO_API_SHIPPER?.trim() ?? "";
  const password = process.env.URBANO_API_PASSWORD ?? "";
  const url = (process.env.URBANO_API_URL?.trim() || DEFAULT_URL).replace(/\/+$/, "");
  return shipper && password ? { shipper, password, url } : null;
}

// Es un GET con la autenticación en el cuerpo: fetch no permite cuerpo en un GET, por eso va con https.
function requestList<T>(resource: string): Promise<T[]> {
  const config = urbanoApiConfig();
  if (!config) throw new UrbanoApiError("Falta configurar la API de Urbano en el servidor (URBANO_API_SHIPPER y URBANO_API_PASSWORD).");
  const payload = JSON.stringify({ autentificacion: { shipper: config.shipper, password: config.password } });
  return new Promise((resolve, reject) => {
    const request = https.request(
      `${config.url}/${resource}/directgroup/`,
      { method: "GET", timeout: TIMEOUT_MS, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("error", () => reject(new UrbanoApiError(`Se cortó la respuesta de la API de Urbano (${resource}).`)));
        response.on("end", () => {
          if (response.statusCode === 401) return reject(new UrbanoApiError("Urbano rechazó las credenciales de la API."));
          if (response.statusCode !== 200) return reject(new UrbanoApiError(`La API de Urbano respondió ${response.statusCode} al pedir ${resource}.`));
          try {
            const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (!Array.isArray(data)) throw new Error();
            resolve(data as T[]);
          } catch {
            reject(new UrbanoApiError(`La API de Urbano devolvió una respuesta inesperada al pedir ${resource}.`));
          }
        });
      },
    );
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", (error) => reject(new UrbanoApiError(`No se pudo consultar la API de Urbano (${resource}): ${error.message}.`)));
    request.end(payload);
  });
}

export const fetchUrbanoApiProducts = () => requestList<UrbanoApiProduct>("productos");
export const fetchUrbanoApiMovements = () => requestList<UrbanoApiMovement>("movimientos");
