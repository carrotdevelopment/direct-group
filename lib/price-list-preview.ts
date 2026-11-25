import { previewPriceImport, type PriceImportPreview, type PricePreviewRow } from "@/lib/price-importer";

export type PriceListFile = { supplier: string; fileName: string; content: Uint8Array };

export const samePriceValues = (row: PricePreviewRow, other: { costDg: number; vatRate: number; publicPrice: number }) =>
  Math.abs(row.costDg - other.costDg) < 0.011 && Math.abs(row.publicPrice - other.publicPrice) < 0.011 && Math.abs(row.vatRate - other.vatRate) < 0.0011;

// Vista previa de varias listas juntas. Si un producto está en más de una, vale la última que llegó.
export async function previewPriceLists(lists: PriceListFile[], month: number, year: number): Promise<PriceImportPreview> {
  const prices = new Map<string, PricePreviewRow>();
  const repeated = new Set<string>();
  const result: PriceImportPreview = { prices: [], message: "", warnings: [], unmatched: [] };
  const messages: string[] = [];
  for (const list of lists) {
    const preview = await previewPriceImport({ supplier: list.supplier, month, year, fileName: list.fileName, buffer: Buffer.from(list.content) });
    messages.push(preview.message);
    result.warnings.push(...preview.warnings.filter((warning) => !result.warnings.includes(warning)));
    result.unmatched.push(...preview.unmatched);
    for (const row of preview.prices) {
      const key = row.uniqueCode.toLowerCase();
      const earlier = prices.get(key);
      if (earlier && !samePriceValues(row, earlier)) repeated.add(row.uniqueCode);
      prices.set(key, row);
    }
  }
  if (repeated.size) result.warnings.push(`En más de una lista con distinto precio (queda el de la última que llegó): ${[...repeated].join(", ")}.`);
  return { ...result, prices: [...prices.values()], message: messages.join(" ") };
}

export function summarizePreview({ prices, unmatched }: PriceImportPreview) {
  return {
    created: prices.filter((row) => !row.existing).length,
    changed: prices.filter((row) => row.existing && !samePriceValues(row, row.existing)).length,
    same: prices.filter((row) => row.existing && samePriceValues(row, row.existing)).length,
    unmatched: unmatched.length,
  };
}
