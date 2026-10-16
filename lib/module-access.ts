export const accessModules = {
  compras: "Compras e ingresos",
  precios: "Precios y estructura de costos",
  proveedores: "Proveedores",
  clientes: "Clientes y códigos",
  productos: "Productos",
  ventas: "Ventas y egresos",
  stock: "Stock",
  importaciones: "Importaciones",
  pasajes: "Pasajes y ajustes",
  correos: "Correos (casilla de proveedores)",
} as const;

export type AccessModule = keyof typeof accessModules;
export type AccessUser = { role: string; moduleAccess: string[] };
export function hasModule(user: AccessUser | null | undefined, module: string) {
  return !!user && (user.role === "ADMIN" || (module !== "admin" && user.moduleAccess.includes(module)));
}

export function pageModule(path: string): string {
  const section = path.split("/").filter(Boolean)[0] ?? "";
  const map: Record<string, string> = {
    compras: "compras", ingresos: "compras", precios: "precios", pricing: "precios",
    "estructura-costos": "precios", proveedores: "proveedores", clientes: "clientes",
    "codigos-clientes": "clientes", productos: "productos", ventas: "ventas",
    egresos: "ventas", stock: "stock", importaciones: "importaciones",
    pasajes: "pasajes", correos: "correos",
  };
  return map[section] ?? "admin";
}

export type PasajeActor = { name: string; role: string; clients: string[] };

export function canActForClient(actor: Pick<PasajeActor, "role" | "clients">, client: string) {
  if (actor.role === "ADMIN") return true;
  const wanted = client.trim().toLowerCase();
  return actor.clients.some((assigned) => assigned.trim().toLowerCase() === wanted);
}

// Pasajes: cualquiera con el módulo puede generarlos desde cualquier cliente; el control es que
// los apruebe quien tiene asignado el cliente destino. Quien lo generó lo sigue viendo y puede
// confirmar la cantidad enviada, aunque no tenga asignado el cliente origen.
type PasajeParties = { fromClient: string; toClient: string; createdBy: string };

export function isPasajeCreator(actor: Pick<PasajeActor, "name">, pasaje: Pick<PasajeParties, "createdBy">) {
  return !!actor.name.trim() && actor.name.trim().toLowerCase() === pasaje.createdBy.trim().toLowerCase();
}

export function canSeePasaje(actor: PasajeActor, pasaje: PasajeParties) {
  return canActForClient(actor, pasaje.fromClient) || canActForClient(actor, pasaje.toClient) || isPasajeCreator(actor, pasaje);
}

export function canConfirmPasaje(actor: PasajeActor, pasaje: PasajeParties) {
  return canActForClient(actor, pasaje.fromClient) || isPasajeCreator(actor, pasaje);
}
