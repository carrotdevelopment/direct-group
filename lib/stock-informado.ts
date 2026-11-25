// Stock informado: cuántas unidades en total se le declararon a la web del cliente. Disponible = informado − canjes.

// En estos clientes el informado es el ingreso físico y sube solo con cada entrega, salvo que se escriba otro.
const BY_INCOME = new Set(["santander", "umiles"]);

export const informadoByIncome = (client: string) => BY_INCOME.has(client.trim().toLowerCase());

export type SavedInformado = { quantity: number | null; overIncome: boolean; updatedBy: string; updatedAt: string };

// null = nadie lo informó: se muestra vacío.
export function resolveInformado(client: string, saved: Pick<SavedInformado, "quantity" | "overIncome"> | undefined, physicalIncome: number) {
  if (saved && saved.quantity !== null) return saved.overIncome ? physicalIncome + saved.quantity : saved.quantity;
  return informadoByIncome(client) ? physicalIncome : null;
}

// undefined = no se entiende; null = vacío.
export function parseInformado(value: unknown): number | null | undefined {
  if (value === null) return null;
  const clean = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : undefined;
  if (clean === undefined) return undefined;
  if (!clean) return null;
  return /^-?\d{1,9}$/.test(clean) ? Number(clean) : undefined;
}
