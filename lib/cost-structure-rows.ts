type PeriodRow = {
  client: string;
  period: string;
  uniqueCode: string;
};

type EditableCostRow = {
  costDgNoVat: number;
  freightNoVat: number;
  pvcNoVat: number;
  pvcWithVat: number;
  pvcUpdatedAt?: string | null;
  freightMode?: "pct" | "fixed";
  freightValue?: number;
  freightCriterion?: { mode: "pct" | "fixed"; value: number } | null;
};

export function costRowChanged(row: EditableCostRow, original?: EditableCostRow) {
  if (!original) return false;
  const fields = ["costDgNoVat", "freightNoVat", "pvcNoVat", "pvcWithVat"] as const;
  if (fields.some(field => Math.abs(row[field] - original[field]) > 0.001)) return true;
  if (row.freightMode && row.freightValue != null) {
    const mode = original.freightMode ?? original.freightCriterion?.mode;
    const value = original.freightValue ?? original.freightCriterion?.value;
    return mode !== row.freightMode || value !== row.freightValue;
  }
  return false;
}

export function displayedPvcPeriod(row: EditableCostRow, original: EditableCostRow | undefined, selectedPeriod: string) {
  return costRowChanged(row, original) ? selectedPeriod : row.pvcUpdatedAt ?? null;
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function mergeChangedPeriodRows<T extends PeriodRow>(
  currentRows: T[],
  changedRows: T[],
  client: string,
  period: string,
) {
  const changedCodes = new Set(changedRows.map((row) => normalize(row.uniqueCode)));
  const untouchedRows = currentRows.filter(
    (row) =>
      !(
        row.period === period &&
        normalize(row.client) === normalize(client) &&
        changedCodes.has(normalize(row.uniqueCode))
      ),
  );
  return [...untouchedRows, ...changedRows];
}
