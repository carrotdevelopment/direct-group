export type PricingInput = {
  cost: number;
  vatRate: number;
  markupRate: number;
  insurance?: number;
  grossIncomeTax?: number;
  debitCreditTax?: number;
  freight?: number;
  missionsTax?: number;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculatePricing(input: PricingInput) {
  const extras = (input.insurance ?? 0) + (input.grossIncomeTax ?? 0) + (input.debitCreditTax ?? 0) + (input.freight ?? 0) + (input.missionsTax ?? 0);
  const totalCost = input.cost + extras;
  const netSalePrice = totalCost * (1 + input.markupRate / 100);
  const grossSalePrice = netSalePrice * (1 + input.vatRate / 100);
  const profit = netSalePrice - totalCost;

  return {
    totalCost: roundMoney(totalCost),
    netSalePrice: roundMoney(netSalePrice),
    grossSalePrice: roundMoney(grossSalePrice),
    profit: roundMoney(profit),
    profitPercentage: totalCost === 0 ? 0 : roundMoney((profit / totalCost) * 100),
  };
}
