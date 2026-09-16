import { createHash } from "node:crypto";

// Exact source-row identity, independent of column ordering and whitespace.
// Preserve all business columns: different redemption IDs must remain distinct.
export function egressSourceHash(record: Record<string, unknown>) {
  const entries = Object.entries(record)
    .filter(([key]) => !key.startsWith("__"))
    .map(([key, value]) => [key.trim().normalize("NFC"), value == null ? "" : String(value).trim().normalize("NFC")])
    .sort(([a], [b]) => a.localeCompare(b));
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

export type EgressBulkScope = { batchId?: string; from?: string; to?: string };

export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function validateEgressScope(scope: EgressBulkScope) {
  if (scope.batchId) return /^\d+$/.test(scope.batchId) && BigInt(scope.batchId) > 0n && !scope.from && !scope.to;
  return !!scope.from && !!scope.to && validDate(scope.from) && validDate(scope.to) && scope.from <= scope.to;
}
