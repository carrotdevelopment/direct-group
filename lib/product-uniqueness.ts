import { normalizeForDuplicateCheck } from "@/lib/normalize";

export class DuplicateProductCodeError extends Error {}

export function validateProductCodes(
  products: { id: string; code: string }[],
  existing: { id: string; code: string }[] = [],
) {
  const owners = new Map<string, Set<string>>();
  for (const product of existing) {
    const key = normalizeForDuplicateCheck(product.code);
    const ids = owners.get(key) ?? new Set<string>();
    ids.add(product.id);
    owners.set(key, ids);
  }
  const seen = new Set<string>();
  for (const product of products) {
    const key = normalizeForDuplicateCheck(product.code);
    if (seen.has(key) || [...(owners.get(key) ?? [])].some((id) => id !== product.id)) {
      throw new DuplicateProductCodeError(`El código de producto ${key} ya existe. No se permiten registros duplicados.`);
    }
    seen.add(key);
  }
}
