import { NextResponse } from "next/server";
import {
  readClientCodesFromExcel,
  type ExcelPrice,
  readPricesFromExcel,
  readProductsFromExcel,
  readSantanderCostRowsFromExcel,
  writeSantanderCostRowsToExcel,
  type ExcelSantanderCostRow,
} from "@/lib/local-excel-db";

export const runtime = "nodejs";

type CostStructureRow = {
  id: string;
  active: boolean;
  stock: number;
  date: string;
  clientCode: string;
  uniqueCode: string;
  costDgUpdatedAt: string | null;
  publicPriceUpdatedAt: string | null;
  product: string;
  supplier: string;
  category: string;
  publicPrice: number;
  vatRate: number;
  markup: number;
  costDgNoVat: number;
  freightNoVat: number;
  pvcNoVat: number;
  pvcWithVat: number;
};

type Rates = {
  insurance: number;
  grossIncome: number;
  debitTax: number;
  creditTax: number;
  missionsTax: number;
};

const defaultRates: Rates = {
  insurance: 1.2,
  grossIncome: 5,
  debitTax: 0.6,
  creditTax: 0.6,
  missionsTax: 1.25,
};

function canonicalClient(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function periodIndex(year: number, month: number) {
  return year * 12 + month;
}

function periodLabel(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function normalizeCode(value: string) {
  return value.trim().toLowerCase();
}

function valueFromPrice(value: number | undefined, fallback: number) {
  return typeof value === "number" && value > 0 ? value : fallback;
}

function pricePeriod(price: ExcelPrice) {
  const [year, month] = price.informedAt.split("-");
  return periodIndex(Number(year), Number(month));
}

function latestPriceValue(
  prices: ExcelPrice[],
  targetPeriod: number,
  field: "costDg" | "publicPrice" | "vatRate" | "markup",
) {
  return prices
    .filter((price) => pricePeriod(price) <= targetPeriod && price[field] > 0)
    .sort((left, right) => {
      const periodDiff = pricePeriod(right) - pricePeriod(left);
      return periodDiff || right.informedAt.localeCompare(left.informedAt);
    })[0];
}

function sourceDateOrNull(price: ExcelPrice | undefined) {
  return price?.informedAt || null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function calculateSantanderCost(row: CostStructureRow, rates: Rates) {
  const ppNoVat = row.publicPrice / (1 + row.vatRate / 100);
  const insurance = (row.costDgNoVat * rates.insurance) / 100;
  const grossIncome = (row.pvcNoVat * rates.grossIncome) / 100;
  const debitTax = (row.pvcNoVat * rates.debitTax) / 100;
  const creditTax = (row.pvcNoVat * rates.creditTax) / 100;
  const missionsTax = (row.pvcNoVat * rates.missionsTax) / 100;
  const totalCost =
    row.costDgNoVat +
    insurance +
    grossIncome +
    debitTax +
    creditTax +
    row.freightNoVat +
    missionsTax;
  const profit = row.pvcNoVat - totalCost;

  return {
    ppNoVat: roundMoney(ppNoVat),
    insurance: roundMoney(insurance),
    grossIncome: roundMoney(grossIncome),
    debitTax: roundMoney(debitTax),
    creditTax: roundMoney(creditTax),
    missionsTax: roundMoney(missionsTax),
    totalCost: roundMoney(totalCost),
    profit: roundMoney(profit),
    profitPercentage: totalCost === 0 ? 0 : roundMoney((profit / totalCost) * 100),
  };
}

function latestByUniqueCode<T extends { uniqueCode: string }>(
  rows: T[],
  getPeriod: (row: T) => number,
  targetPeriod: number,
) {
  const map = new Map<string, T>();
  for (const row of rows) {
    if (getPeriod(row) > targetPeriod) continue;
    const current = map.get(row.uniqueCode);
    if (!current || getPeriod(row) > getPeriod(current)) {
      map.set(row.uniqueCode, row);
    }
  }
  return map;
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const client = url.searchParams.get("client") || "";
  const month = Number(url.searchParams.get("month") || "0");
  const year = Number(url.searchParams.get("year") || "0");

  if (canonicalClient(client) !== "santander") {
    return NextResponse.json({
      rows: [],
      message: "Por ahora solo estÃ¡ cargada la estructura real de Santander.",
    });
  }
  if (!month || !year) {
    return NextResponse.json(
      { rows: [], message: "Mes y aÃ±o son obligatorios." },
      { status: 400 },
    );
  }

  const targetPeriod = periodIndex(year, month);
  const targetPeriodLabel = periodLabel(year, month);
  const santanderAssignments = readClientCodesFromExcel().filter(
    (mapping) => canonicalClient(mapping.client) === "santander",
  );
  const assignmentSourcePeriod = santanderAssignments
    .map((mapping) => periodIndex(mapping.year, mapping.month))
    .filter((period) => period <= targetPeriod)
    .sort((left, right) => right - left)[0];
  const assignmentSourceYear = assignmentSourcePeriod
    ? Math.floor((assignmentSourcePeriod - 1) / 12)
    : 0;
  const assignmentSourceMonth = assignmentSourcePeriod
    ? assignmentSourcePeriod - assignmentSourceYear * 12
    : 0;
  const exactAssignments = santanderAssignments.filter(
    (mapping) =>
      mapping.month === assignmentSourceMonth &&
      mapping.year === assignmentSourceYear,
  );
  const assignmentSourceLabel = assignmentSourcePeriod
    ? periodLabel(assignmentSourceYear, assignmentSourceMonth)
    : targetPeriodLabel;
  const products = new Map(
    readProductsFromExcel().map((product) => [product.code, product]),
  );
  const pricesByUniqueCode = new Map<string, ExcelPrice[]>();
  for (const price of readPricesFromExcel()) {
    const code = normalizeCode(price.uniqueCode);
    const current = pricesByUniqueCode.get(code) ?? [];
    current.push(price);
    pricesByUniqueCode.set(code, current);
  }
  const santanderCosts = readSantanderCostRowsFromExcel();
  const latestCosts = latestByUniqueCode(
    santanderCosts,
    (row) => periodIndex(row.year, row.month),
    targetPeriod,
  );

  const rows: CostStructureRow[] = exactAssignments
    .map((assignment) => {
      const cost = latestCosts.get(assignment.uniqueCode);
      const prices = pricesByUniqueCode.get(
        normalizeCode(assignment.uniqueCode),
      ) ?? [];
      const costDgPrice = latestPriceValue(prices, targetPeriod, "costDg");
      const publicPricePrice = latestPriceValue(
        prices,
        targetPeriod,
        "publicPrice",
      );
      const vatPrice = latestPriceValue(prices, targetPeriod, "vatRate");
      const markupPrice = latestPriceValue(prices, targetPeriod, "markup");
      const product = products.get(assignment.uniqueCode);
      const costIsCurrent = cost?.period === targetPeriodLabel;
      const costDgDate = sourceDateOrNull(costDgPrice);
      const priceInfoDates = [
        sourceDateOrNull(publicPricePrice),
        sourceDateOrNull(vatPrice),
        sourceDateOrNull(markupPrice),
      ].filter(Boolean) as string[];
      const priceInfoIsCurrent =
        priceInfoDates.length === 3 &&
        priceInfoDates.every((date) => date.startsWith(targetPeriodLabel));
      const latestPriceInfoDate =
        priceInfoDates.sort((left, right) => right.localeCompare(left))[0] ||
        null;
      const stalePriceInfoDate =
        priceInfoDates.find((date) => !date.startsWith(targetPeriodLabel)) ||
        null;
      return {
        id: assignment.uniqueCode,
        active: true,
        stock: 0,
        date: `${targetPeriodLabel}-01`,
        clientCode: assignment.clientCode,
        uniqueCode: assignment.uniqueCode,
        costDgUpdatedAt:
          costDgDate ||
          (costIsCurrent ? `${targetPeriodLabel}-01` : null),
        publicPriceUpdatedAt:
          priceInfoIsCurrent && latestPriceInfoDate
            ? latestPriceInfoDate
            : stalePriceInfoDate,
        product: cost?.product || product?.name || "",
        supplier: cost?.supplier || product?.supplier || "",
        category: cost?.category || product?.category || "",
        publicPrice: valueFromPrice(
          publicPricePrice?.publicPrice,
          cost?.publicPrice ?? 0,
        ),
        vatRate: valueFromPrice(vatPrice?.vatRate, cost?.vatRate ?? 21),
        markup: valueFromPrice(markupPrice?.markup, cost?.markup ?? 0),
        costDgNoVat: valueFromPrice(
          costDgPrice?.costDg,
          cost?.costDgNoVat ?? 0,
        ),
        freightNoVat: cost?.freightNoVat || 0,
        pvcNoVat: cost?.pvcNoVat || 0,
        pvcWithVat: cost?.pvcWithVat || 0,
      };
    })
    .sort((left, right) =>
      left.clientCode.localeCompare(right.clientCode, "es", {
        numeric: true,
      }),
    );

  return NextResponse.json({
    rows,
    message:
      assignmentSourceLabel === targetPeriodLabel
        ? `${rows.length} productos Santander asignados en código cliente para ${targetPeriodLabel}.`
        : `${rows.length} productos Santander asignados en código cliente para ${targetPeriodLabel}. Se usó la asignación de ${assignmentSourceLabel}.`,
  });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    client?: string;
    month?: number;
    year?: number;
    rates?: Partial<Rates>;
    rows?: CostStructureRow[];
  };
  const client = body.client || "";
  const month = Number(body.month || 0);
  const year = Number(body.year || 0);
  const rows = body.rows || [];

  if (canonicalClient(client) !== "santander" || !month || !year) {
    return NextResponse.json(
      { ok: false, message: "Cliente, mes o aÃ±o invÃ¡lido." },
      { status: 400 },
    );
  }

  const period = periodLabel(year, month);
  const rates = { ...defaultRates, ...body.rates };
  const existing = readSantanderCostRowsFromExcel().filter(
    (row) =>
      !(row.period === period && canonicalClient(row.client) === "santander"),
  );
  const nextRows: ExcelSantanderCostRow[] = rows.map((row) => {
    const calc = calculateSantanderCost(row, rates);
    return {
      client: "Santander",
      period,
      month,
      year,
      date: `${period}-01`,
      clientCode: row.clientCode,
      uniqueCode: row.uniqueCode,
      costUpdated:
        row.costDgUpdatedAt?.startsWith(period) &&
        row.publicPriceUpdatedAt?.startsWith(period)
          ? "OK"
          : "",
      product: row.product,
      supplier: row.supplier,
      category: row.category,
      publicPrice: row.publicPrice,
      vatRate: row.vatRate,
      markup: row.markup,
      ppNoVat: calc.ppNoVat,
      costDgNoVat: row.costDgNoVat,
      insurance: calc.insurance,
      grossIncome: calc.grossIncome,
      debitTax: calc.debitTax,
      creditTax: calc.creditTax,
      freightNoVat: row.freightNoVat,
      totalCost: calc.totalCost,
      pvcNoVat: row.pvcNoVat,
      pvcWithVat: row.pvcWithVat,
      profit: calc.profit,
      profitPercentage: calc.profitPercentage,
      missionsTax: calc.missionsTax,
      volumetricWeight: 0,
      unitsPerPackage: 0,
      source: "WEB",
    };
  });

  writeSantanderCostRowsToExcel([...existing, ...nextRows]);
  return NextResponse.json({
    ok: true,
    rows,
    message: `Estructura Santander ${period} guardada.`,
  });
}
