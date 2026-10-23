// Migración de código cliente: un producto de un cliente cambia de código cliente (por ejemplo, Pampa
// 75-5030 → 76-5030). Reglas, sin dependencias de servidor.

export type MigrationCode = { client: string; clientCode: string; uniqueCode: string; active: boolean; voided: boolean };

export type MigrationCheck =
  | { ok: false; error: string }
  | { ok: true; client: string; oldCode: string; newCode: string; uniqueCode: string; newExists: boolean };

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

// El código a migrar tiene que ser del cliente (puede no estar vigente) y el nuevo, si ya existe, tiene
// que ser del mismo cliente y del mismo producto. Si no existe, se da de alta con ese producto.
export function checkMigration(codes: MigrationCode[], client: string, oldCode: string, newCode: string): MigrationCheck {
  const from = oldCode.trim();
  const to = newCode.trim();
  if (!client.trim()) return { ok: false, error: "Elegí el cliente." };
  if (!from || !to) return { ok: false, error: "Completá el código a migrar y el código nuevo." };
  if (normalize(from) === normalize(to)) return { ok: false, error: "El código nuevo tiene que ser distinto del código a migrar." };

  const sameClient = (code: MigrationCode) => normalize(code.client) === normalize(client) && !code.voided;
  const oldMappings = codes.filter((code) => sameClient(code) && normalize(code.clientCode) === normalize(from));
  if (oldMappings.length === 0) return { ok: false, error: `El código ${from} no está asignado a ${client}.` };
  const products = [...new Set(oldMappings.map((code) => normalize(code.uniqueCode)))];
  if (products.length > 1) return { ok: false, error: `El código ${from} tiene más de un producto asignado en ${client}: revisalo en el historial.` };
  const uniqueCode = (oldMappings.find((code) => code.active) ?? oldMappings[0]).uniqueCode;

  const elsewhere = codes.find((code) => !code.voided && normalize(code.clientCode) === normalize(to) && normalize(code.client) !== normalize(client));
  if (elsewhere) return { ok: false, error: `El código ${to} ya está asignado a otro cliente (${elsewhere.client}).` };
  const newMappings = codes.filter((code) => sameClient(code) && normalize(code.clientCode) === normalize(to));
  const otherProduct = newMappings.find((code) => normalize(code.uniqueCode) !== normalize(uniqueCode));
  if (otherProduct) {
    return { ok: false, error: `El código ${to} es de otro producto (${otherProduct.uniqueCode}); el código ${from} es de ${uniqueCode}.` };
  }
  return { ok: true, client, oldCode: from, newCode: to, uniqueCode, newExists: newMappings.length > 0 };
}
