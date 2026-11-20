// Qué clientes puede ver cada usuario fuera de Pasajes: el administrador ve todos; el resto, solo los
// clientes que tiene asignados en Permisos (los mismos de Pasajes). Quien tiene "ver todos los pasajes"
// no amplía esto: ese permiso vale solo dentro de Pasajes.

// null = sin restricción; una lista (puede estar vacía) = solo esos clientes.
export type ClientScope = string[] | null;

type ScopeUser = { role?: string | null; pasajeClients?: string[] | null } | null | undefined;

function canonical(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function clientScopeFor(user: ScopeUser): ClientScope {
  if (user?.role === "ADMIN") return null;
  return [...new Set((user?.pasajeClients ?? []).map((client) => client.trim()).filter(Boolean))];
}

export function inClientScope(scope: ClientScope, client: unknown) {
  if (scope === null) return true;
  const wanted = canonical(client);
  return !!wanted && scope.some((allowed) => canonical(allowed) === wanted);
}

export function filterByClientScope<T>(scope: ClientScope, rows: T[], clientOf: (row: T) => unknown) {
  return scope === null ? rows : rows.filter((row) => inClientScope(scope, clientOf(row)));
}

// Nombre que no corresponde a ningún cliente (la base de datos no acepta caracteres nulos en un texto).
export const NO_CLIENT = "(sin acceso a ningún cliente)";

// Para los clientes que se piden en un filtro: se quedan solo los permitidos. Si pidió alguno y ninguno
// está permitido, no debe volver todo: se devuelve una lista que no coincide con nada.
export function restrictRequestedClients(scope: ClientScope, requested: string[]) {
  if (scope === null) return requested;
  const allowed = requested.length ? requested.filter((client) => inClientScope(scope, client)) : scope;
  return allowed.length ? allowed : [NO_CLIENT];
}
