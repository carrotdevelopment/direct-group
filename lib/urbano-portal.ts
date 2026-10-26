import "server-only";
import { urbanoStockTableFromHtml } from "@/lib/urbano-stock";

// Urbano no tiene API de stock: el reporte "Stock en línea" se pide al portal de clientes igual que lo
// hace el navegador (inicio de sesión y consulta de la tabla). Usuario y contraseña van en el .env:
// URBANO_PORTAL_USER, URBANO_PORTAL_PASSWORD y URBANO_PORTAL_COMPANIES (compañías WMS, por ejemplo "310").
const BASE = "https://urbano.com.ar/urbano3/portal_clientes/";
const TIMEOUT_MS = 60_000;

export class UrbanoPortalError extends Error {}

export function urbanoPortalConfig() {
  const user = process.env.URBANO_PORTAL_USER?.trim() ?? "";
  const password = process.env.URBANO_PORTAL_PASSWORD ?? "";
  const companies = (process.env.URBANO_PORTAL_COMPANIES ?? "310").split(",").map((value) => value.trim()).filter(Boolean);
  return user && password && companies.length ? { user, password, companies } : null;
}

// Sesión PHP del portal: guarda las cookies que devuelve cada respuesta.
class Session {
  private cookies = new Map<string, string>();

  async request(path: string, body?: URLSearchParams) {
    const response = await fetch(new URL(path, BASE), {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" } : {}),
        "X-Requested-With": "XMLHttpRequest",
        Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const separator = pair.indexOf("=");
      if (separator > 0) this.cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    }
    return { status: response.status, text: await response.text() };
  }
}

async function login(session: Session, user: string, password: string) {
  await session.request("login.php");
  // Como en el portal: "usuario@shipper" entra por el caso "logincd".
  const [username, shipper] = user.includes("@") ? user.split("@") : [user, undefined];
  const loginCase = shipper === undefined ? "" : "logincd";
  const body = new URLSearchParams({ case: loginCase, username, password });
  if (shipper !== undefined) body.set("shipper", shipper);
  const result = await session.request(`class/login/loginController.php?case=${loginCase}`, body);
  if (result.status !== 200) {
    let message = "Urbano rechazó el usuario o la contraseña del portal.";
    try {
      message = (JSON.parse(result.text) as { error?: string }).error || message;
    } catch {}
    throw new UrbanoPortalError(message);
  }
}

// Devuelve la tabla del reporte (títulos + renglones) de todas las compañías configuradas.
export async function fetchUrbanoPortalStock() {
  const config = urbanoPortalConfig();
  if (!config) throw new UrbanoPortalError("Falta configurar el usuario del portal de Urbano en el servidor (URBANO_PORTAL_USER y URBANO_PORTAL_PASSWORD).");
  const session = new Session();
  await login(session, config.user, config.password);
  const matrix: string[][] = [];
  for (const company of config.companies) {
    const result = await session.request(
      "class/report_wms_stock/wmsStockController.php?case=getStock",
      new URLSearchParams({ "compañia_code": `,${company},`, producto_busqueda: "%%", producto_lote: "%%", estado: ",TOD," }),
    );
    if (result.status !== 200) throw new UrbanoPortalError(`El portal de Urbano respondió ${result.status} al pedir el stock de la compañía ${company}.`);
    const table = urbanoStockTableFromHtml(result.text);
    matrix.push(...(matrix.length ? table.slice(1) : table));
  }
  await session.request("logout.php").catch(() => undefined);
  return { matrix, companies: config.companies };
}
