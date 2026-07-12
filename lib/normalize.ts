export function normalizeForDuplicateCheck(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}
