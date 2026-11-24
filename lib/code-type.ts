// Regular o especial: solo Credicoop separa así sus códigos (las dos hojas de su planilla de stock).
export const CODE_TYPES = ["REGULAR", "ESPECIAL"] as const;
export type CodeType = (typeof CODE_TYPES)[number];
export const CODE_TYPE_LABEL: Record<CodeType, string> = { REGULAR: "Regular", ESPECIAL: "Especial" };

export function usesCodeType(client: string) {
  return client.trim().toLowerCase() === "credicoop";
}

export function isCodeType(value: unknown): value is CodeType {
  return CODE_TYPES.includes(value as CodeType);
}
