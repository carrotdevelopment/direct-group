import { NextResponse } from "next/server";
import {
  readPricesFromExcel,
  writePricesToExcel,
  type ExcelPrice,
} from "@/lib/local-excel-db";

export const runtime = "nodejs";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const prices = readPricesFromExcel();

  if (searchParams.get("meta") === "1") {
    const suppliers = Array.from(
      new Set(prices.map((price) => price.supplier).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right, "es"));
    const months = Array.from(
      new Set(
        prices.map((price) => price.informedAt.split("-")[1]).filter(Boolean),
      ),
    ).sort((left, right) => Number(left) - Number(right));
    const years = Array.from(
      new Set(
        prices.map((price) => price.informedAt.split("-")[0]).filter(Boolean),
      ),
    ).sort((left, right) => Number(right) - Number(left));

    return NextResponse.json({
      options: { suppliers, months, years },
      total: prices.length,
    });
  }

  const supplier = searchParams.get("supplier") || "all";
  const month = searchParams.get("month") || "all";
  const year = searchParams.get("year") || "all";
  const filteredPrices = prices
    .filter((price) => {
      const matchesSupplier = supplier === "all" || price.supplier === supplier;
      const [priceYear, priceMonth] = price.informedAt.split("-");
      const matchesMonth = month === "all" || priceMonth === month;
      const matchesYear = year === "all" || priceYear === year;
      return matchesSupplier && matchesMonth && matchesYear;
    })
    .sort((left, right) => right.informedAt.localeCompare(left.informedAt));

  return NextResponse.json({
    prices: filteredPrices.slice(0, 1000),
    total: filteredPrices.length,
  });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { prices?: ExcelPrice[] };
  const prices = body.prices ?? [];
  const allPrices = readPricesFromExcel();
  const mergedById = new Map(allPrices.map((price) => [price.id, price]));

  for (const price of prices) {
    mergedById.set(price.id, price);
  }

  writePricesToExcel(Array.from(mergedById.values()));
  return NextResponse.json({ prices });
}
