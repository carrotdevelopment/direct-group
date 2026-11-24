export type CostRate = { id: string; rateName: string; rateKey: string; applies: boolean; valuePct: number; appliesTo: "COSTO" | "PRECIO"; sortOrder: number; onVatPrice?: boolean };
export type CostInput = { publicPrice: number; vatRate: number; costDgNoVat: number; freightNoVat: number; pvcNoVat: number; channelFeePct?: number | null };
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

// Producteca agrupa varios bancos: un solo stock, pero cada uno con su precio y sus comisiones.
const COST_CHANNELS: Record<string, string[]> = {
  producteca: ["Banco Nación", "Provincia", "ICBC", "Tienda Credicoop"],
};
export function costChannels(client: string): string[] {
  return COST_CHANNELS[client.trim().replace(/\s+/g, " ").toLowerCase()] ?? [];
}

// El canal elegido si es del cliente; si no, el primero ("" en los clientes sin canales).
export function costChannelOrDefault(client: string, choice: string): string {
  const channels = costChannels(client);
  return channels.includes(choice) ? choice : channels[0] ?? "";
}

// Tasas de cada canal, las mismas de su planilla: reemplazan a las del cliente. Provincia no tiene
// planilla vigente y usa las del cliente.
const channelRate = (rateKey: string, rateName: string, valuePct: number, appliesTo: CostRate["appliesTo"], onVatPrice = false): CostRate => ({
  id: `canal-${rateKey}`, rateName, rateKey, applies: true, valuePct, appliesTo, sortOrder: 1, onVatPrice,
});
const CHANNEL_RATES: Record<string, CostRate[]> = {
  "Banco Nación": [
    channelRate("seguro", "Seguro", 0.08, "COSTO"),
    channelRate("ingresos_brutos", "Ing. Brutos", 5, "PRECIO"),
    channelRate("impuesto_debito", "Imp. Débito", 0.6, "PRECIO"),
    channelRate("impuesto_credito", "Imp. Crédito", 0.384, "PRECIO"),
    channelRate("impuesto_misiones", "Imp. Misiones", 1.25, "PRECIO"),
  ],
  ICBC: [
    channelRate("seguro", "Seguro", 0.08, "COSTO"),
    channelRate("ingresos_brutos", "Ing. Brutos", 5, "PRECIO"),
    channelRate("impuesto_misiones", "Imp. Misiones", 1.25, "PRECIO", true),
  ],
  "Tienda Credicoop": [
    channelRate("seguro", "Seguro", 0.08, "COSTO"),
    channelRate("ingresos_brutos", "Ing. Brutos", 5, "PRECIO"),
    channelRate("impuesto_misiones", "Imp. Misiones", 1.25, "PRECIO", true),
  ],
};
export function channelRates(client: string, channel: string): CostRate[] | null {
  return costChannels(client).includes(channel) ? CHANNEL_RATES[channel] ?? null : null;
}

// Cargos sobre el PVC s/IVA de una fila. Los que la planilla calcula sobre el PVC con IVA se llevan a su
// equivalente sin IVA, y se suma la comisión del canal (cuotas, tarjeta y comisión), propia de cada fila.
export function rowPriceRates(row: { vatRate: number; channelFeePct?: number | null }, precioItems: CostRate[]): CostRate[] {
  const items = precioItems.map((rate) => rate.onVatPrice
    ? { ...rate, valuePct: Math.round(rate.valuePct * (1 + row.vatRate / 100) * 10000) / 10000, onVatPrice: false }
    : rate);
  const pct = row.channelFeePct ?? 0;
  if (!Number.isFinite(pct) || pct <= 0) return items;
  return [...items, {
    id: "comision_canal", rateName: "Comisiones del canal", rateKey: "comision_canal", applies: true,
    valuePct: pct, appliesTo: "PRECIO", sortOrder: 99,
  }];
}

export function calculate(row: CostInput, costoItems: CostRate[], precioItems: CostRate[]): CalcResult {
  const ppNoVat = row.vatRate > 0 ? round2(row.publicPrice / (1 + row.vatRate / 100)) : row.publicPrice;
  const costoBreakdown = costoItems.map((r) => ({
    ...r,
    amount: round2((row.costDgNoVat * r.valuePct) / 100),
  }));
  const precioBreakdown = rowPriceRates(row, precioItems).map((r) => ({
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

// Amex usa un porcentaje propio por período que se suma, solo como dato informativo, al precio
// público con IVA y al PVC sin IVA. No cambia la utilidad. "Amex Futuro" no lo usa.
export function isAmexClient(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase() === "amex";
}

export function plusPercentage(price: number, pct: number) {
  if (!Number.isFinite(price) || !Number.isFinite(pct)) return 0;
  return round2(price * (1 + pct / 100));
}
