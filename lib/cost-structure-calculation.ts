export type CostRate = { id: string; rateName: string; rateKey: string; applies: boolean; valuePct: number; appliesTo: "COSTO" | "PRECIO"; sortOrder: number };
export type CostInput = { publicPrice: number; vatRate: number; costDgNoVat: number; freightNoVat: number; pvcNoVat: number };
export function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }
export function selectRateConfig<T extends { effectiveFrom: string }>(configs: T[], period: string): T | null {
 return configs.filter(c => c.effectiveFrom <= period).sort((a,b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
}
export type CalcResult = {
  ppNoVat: number;
  costoBreakdown: Array<CostRate & { amount: number }>;
  precioBreakdown: Array<CostRate & { amount: number }>;
  totalCost: number;
  profit: number;
  profitPct: number;
};

export function calculate(row: CostInput, costoItems: CostRate[], precioItems: CostRate[]): CalcResult {
  const ppNoVat = row.vatRate > 0 ? round2(row.publicPrice / (1 + row.vatRate / 100)) : row.publicPrice;
  const costoBreakdown = costoItems.map((r) => ({
    ...r,
    amount: round2((row.costDgNoVat * r.valuePct) / 100),
  }));
  const precioBreakdown = precioItems.map((r) => ({
    ...r,
    amount: round2((row.pvcNoVat * r.valuePct) / 100),
  }));
  const totalCost = round2(
    row.costDgNoVat +
      costoBreakdown.reduce((s, r) => s + r.amount, 0) +
      precioBreakdown.reduce((s, r) => s + r.amount, 0) +
      row.freightNoVat,
  );
  const profit = round2(row.pvcNoVat - totalCost);
  const profitPct = totalCost === 0 ? 0 : round2((profit / totalCost) * 100);
  return { ppNoVat, costoBreakdown, precioBreakdown, totalCost, profit, profitPct };
}

// Closed-form formula: pvcNoVat = A(1+p) / (1 - R(1+p))
// A = costDg × (1 + Σ costoRates) + freight
// R = Σ precioRates (as fractions)
// p = targetProfitPct / 100
export function proposedPvcNoVat(
  costDg: number,
  freight: number,
  targetProfitPct: number,
  costoItems: CostRate[],
  precioItems: CostRate[],
): number | null {
  const p = targetProfitPct / 100;
  const costoSum = costoItems.reduce((s, r) => s + r.valuePct / 100, 0);
  const A = costDg * (1 + costoSum) + freight;
  const R = precioItems.reduce((s, r) => s + r.valuePct / 100, 0);
  const denominator = 1 - R * (1 + p);
  if (denominator <= 0 || !Number.isFinite(denominator)) return null;
  return round2((A * (1 + p)) / denominator);
}
