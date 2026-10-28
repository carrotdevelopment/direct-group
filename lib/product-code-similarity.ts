// Códigos únicos parecidos: el mismo producto suele cargarse con variantes del código ("SL-EK1714",
// "sl ek1714", "SLEK1714WPN"). Para comparar se pasa a mayúsculas y se sacan acentos, espacios y signos.

export function canonicalProductCode(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// Largo mínimo para avisar que un código contiene a otro: con menos caracteres hay demasiadas coincidencias.
const MIN_CONTAINED_LENGTH = 4;

export type SimilarCode = { code: string; name: string; reason: "same" | "contains" | "contained" };

export function findSimilarProductCodes(
  input: string,
  products: { id?: string; code: string; name: string }[],
  excludeId?: string | null,
): SimilarCode[] {
  const wanted = canonicalProductCode(input);
  if (!wanted) return [];
  const matches: SimilarCode[] = [];
  for (const product of products) {
    if (excludeId && product.id === excludeId) continue;
    const other = canonicalProductCode(product.code);
    if (!other) continue;
    if (other === wanted) matches.push({ code: product.code, name: product.name, reason: "same" });
    else if (other.length >= MIN_CONTAINED_LENGTH && wanted.includes(other)) matches.push({ code: product.code, name: product.name, reason: "contains" });
    else if (wanted.length >= MIN_CONTAINED_LENGTH && other.includes(wanted)) matches.push({ code: product.code, name: product.name, reason: "contained" });
  }
  const order = { same: 0, contains: 1, contained: 2 };
  return matches.sort((a, b) => order[a.reason] - order[b.reason] || a.code.localeCompare(b.code));
}

export function describeSimilarCode(input: string, match: SimilarCode) {
  const product = match.name ? ` (${match.name})` : "";
  if (match.reason === "same") return `${input} es el mismo código que ${match.code}${product} sin contar mayúsculas, espacios ni signos.`;
  if (match.reason === "contains") return `${input} contiene al código ${match.code}${product}.`;
  return `${input} está dentro del código ${match.code}${product}.`;
}
