import { NextResponse } from "next/server";
import {
  readClientCodesFromExcel,
  type ExcelPrice,
  readPricesFromExcel,
  readProductsFromExcel,
  readSantanderCostRowsFromExcel,
  writeSantanderCostRowsToExcel,
  type ExcelSantanderCostRow,
  readFreightCriteria,
  getActiveCriterion,
  upsertFreightCriterion,
  type FreightCriterionEntry,
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
  latestSupplierCostDg: number;
  supplierCostDgDate: string | null;
  hasPriceAlert: boolean;
  segment: "active" | "inactive_with_stock" | "inactive";
  pvcHistory: Array<{ period: string; pvcWithVat: number }>;
  freightCriterion: FreightCriterionEntry | null;
  // Transient — only present in PUT body, not returned by GET:
  freightMode?: "pct" | "fixed";
  freightValue?: number;
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
  const historyFor = url.searchParams.get("historyFor") || "";
  const today = new Date();
  const currentPeriodKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  if (canonicalClient(client) !== "santander") {
    return NextResponse.json({
      rows: [],
      message: "Por ahora solo está cargada la estructura real de Santander.",
    });
  }

  // Period filter — default to current month/year
  const reqMonth = url.searchParams.get("month");
  const reqYear = url.searchParams.get("year");
  const targetMonth = reqMonth ? Number(reqMonth) : today.getMonth() + 1;
  const targetYear = reqYear ? Number(reqYear) : today.getFullYear();
  const targetPeriod = periodIndex(targetYear, targetMonth);
  const targetPeriodKey = periodLabel(targetYear, targetMonth);

  // History search mode — return all periods for codes matching clientCode
  if (historyFor) {
    const needle = historyFor.trim().toLowerCase();
    const matched = readSantanderCostRowsFromExcel()
      .filter((row) => row.clientCode.toLowerCase().includes(needle))
      .sort(
        (a, b) =>
          b.period.localeCompare(a.period) ||
          a.clientCode.localeCompare(b.clientCode, "es", { numeric: true }),
      );
    return NextResponse.json({
      rows: matched.map((row) => ({
        period: row.period,
        clientCode: row.clientCode,
        uniqueCode: row.uniqueCode,
        product: row.product,
        supplier: row.supplier,
        vatRate: row.vatRate,
        freightNoVat: row.freightNoVat,
        pvcNoVat: row.pvcNoVat,
        pvcWithVat: row.pvcWithVat,
        profitPercentage: row.profitPercentage,
      })),
      message: `${matched.length} registro${matched.length !== 1 ? "s" : ""} encontrado${matched.length !== 1 ? "s" : ""}.`,
    });
  }

  // All assignments for this client — deduplicate by uniqueCode, keeping the latest batch
  const allAssignments = readClientCodesFromExcel().filter(
    (mapping) => canonicalClient(mapping.client) === "santander",
  );
  const latestAssignmentByCode = new Map<string, typeof allAssignments[0]>();
  for (const assignment of allAssignments) {
    const current = latestAssignmentByCode.get(assignment.uniqueCode);
    if (
      !current ||
      periodIndex(assignment.assignedYear, assignment.assignedMonth) >
        periodIndex(current.assignedYear, current.assignedMonth)
    ) {
      latestAssignmentByCode.set(assignment.uniqueCode, assignment);
    }
  }

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

  // Latest saved cost row per uniqueCode, up to the requested period
  const allCostRows = readSantanderCostRowsFromExcel();
  const latestCosts = latestByUniqueCode(
    allCostRows,
    (row) => periodIndex(row.year, row.month),
    targetPeriod,
  );

  // Freight criteria — keyed by uniqueCode
  const freightCriteriaStore = readFreightCriteria();

  // History map: last 3 periods per uniqueCode up to targetPeriod (desc)
  const historyByCode = new Map<string, Array<{ period: string; pvcWithVat: number }>>();
  for (const row of allCostRows) {
    if (periodIndex(row.year, row.month) > targetPeriod) continue;
    const list = historyByCode.get(row.uniqueCode) ?? [];
    list.push({ period: row.period, pvcWithVat: row.pvcWithVat });
    historyByCode.set(row.uniqueCode, list);
  }
  for (const [code, list] of historyByCode) {
    historyByCode.set(
      code,
      list.sort((a, b) => b.period.localeCompare(a.period)).slice(0, 3),
    );
  }

  const rows: CostStructureRow[] = Array.from(latestAssignmentByCode.values())
    .map((assignment) => {
      const cost = latestCosts.get(assignment.uniqueCode);
      const prices = pricesByUniqueCode.get(normalizeCode(assignment.uniqueCode)) ?? [];
      const costDgPrice = latestPriceValue(prices, targetPeriod, "costDg");
      const publicPricePrice = latestPriceValue(prices, targetPeriod, "publicPrice");
      const vatPrice = latestPriceValue(prices, targetPeriod, "vatRate");
      const markupPrice = latestPriceValue(prices, targetPeriod, "markup");
      const product = products.get(assignment.uniqueCode);

      const costDgDate = sourceDateOrNull(costDgPrice);

      const savedCostDg = cost?.costDgNoVat ?? 0;
      const liveCostDg = costDgPrice?.costDg ?? 0;
      const stock = 0; // will be populated from stock module when available
      const active = assignment.active;
      const segment: CostStructureRow["segment"] = active
        ? "active"
        : stock > 0
          ? "inactive_with_stock"
          : "inactive";

      return {
        id: assignment.uniqueCode,
        active,
        stock,
        date: cost ? `${cost.period}-01` : "",
        clientCode: assignment.clientCode,
        uniqueCode: assignment.uniqueCode,
        costDgUpdatedAt: costDgDate,
        publicPriceUpdatedAt: cost?.period ?? null,
        product: cost?.product || product?.name || "",
        supplier: cost?.supplier || product?.supplier || "",
        category: cost?.category || product?.category || "",
        publicPrice: valueFromPrice(publicPricePrice?.publicPrice, cost?.publicPrice ?? 0),
        vatRate: valueFromPrice(vatPrice?.vatRate, cost?.vatRate ?? 21),
        markup: valueFromPrice(markupPrice?.markup, cost?.markup ?? 0),
        costDgNoVat: savedCostDg > 0 ? savedCostDg : liveCostDg,
        freightNoVat: (() => {
          const costDg = savedCostDg > 0 ? savedCostDg : liveCostDg;
          const criterion = getActiveCriterion(
            freightCriteriaStore[assignment.uniqueCode] ?? [],
            targetPeriodKey,
          );
          if (criterion) {
            return criterion.mode === "pct"
              ? roundMoney((costDg * criterion.value) / 100)
              : roundMoney(criterion.value);
          }
          return cost?.freightNoVat ?? 0;
        })(),
        pvcNoVat: cost?.pvcNoVat || 0,
        pvcWithVat: cost?.pvcWithVat || 0,
        latestSupplierCostDg: liveCostDg,
        supplierCostDgDate: sourceDateOrNull(costDgPrice),
        hasPriceAlert:
          savedCostDg > 0 && liveCostDg > 0 && Math.abs(savedCostDg - liveCostDg) > 0.01,
        segment,
        pvcHistory: historyByCode.get(assignment.uniqueCode) ?? [],
        freightCriterion: getActiveCriterion(
          freightCriteriaStore[assignment.uniqueCode] ?? [],
          targetPeriodKey,
        ),
      };
    })
    .sort((a, b) => a.clientCode.localeCompare(b.clientCode, "es", { numeric: true }));

  const activeCount = rows.filter((r) => r.segment === "active").length;
  const inactiveStockCount = rows.filter((r) => r.segment === "inactive_with_stock").length;
  const inactiveCount = rows.filter((r) => r.segment === "inactive").length;

  return NextResponse.json({
    rows,
    message: `${activeCount} activos · ${inactiveStockCount} inactivos con stock · ${inactiveCount} inactivos — ${rows.length} códigos en total.`,
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
  const now = new Date();
  const month = Number(body.month || now.getMonth() + 1);
  const year = Number(body.year || now.getFullYear());
  const rows = body.rows || [];

  if (canonicalClient(client) !== "santander") {
    return NextResponse.json(
      { ok: false, message: "Cliente inválido." },
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

  // Persist freight criteria for rows where one was applied this session
  for (const row of rows) {
    if (row.freightMode && row.freightValue != null) {
      upsertFreightCriterion(row.uniqueCode, {
        mode: row.freightMode,
        value: row.freightValue,
        effectiveFrom: period,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    rows,
    message: `Estructura Santander ${period} guardada.`,
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    client?: string;
    uniqueCode?: string;
    period?: string;
    freightNoVat?: number;
    pvcNoVat?: number;
    pvcWithVat?: number;
  };

  if (canonicalClient(body.client || "") !== "santander") {
    return NextResponse.json({ ok: false, message: "Cliente inválido." }, { status: 400 });
  }

  const uniqueCode = body.uniqueCode || "";
  const period = body.period || "";
  if (!uniqueCode || !period) {
    return NextResponse.json({ ok: false, message: "Parámetros incompletos." }, { status: 400 });
  }

  const allRows = readSantanderCostRowsFromExcel();
  const idx = allRows.findIndex((r) => r.uniqueCode === uniqueCode && r.period === period);
  if (idx === -1) {
    return NextResponse.json({ ok: false, message: "Fila no encontrada." }, { status: 404 });
  }

  const existing = allRows[idx];
  const freightNoVat = typeof body.freightNoVat === "number" ? body.freightNoVat : existing.freightNoVat;
  const pvcNoVat = typeof body.pvcNoVat === "number" ? body.pvcNoVat : existing.pvcNoVat;
  const pvcWithVat = typeof body.pvcWithVat === "number" ? body.pvcWithVat : existing.pvcWithVat;

  const tempRow: CostStructureRow = {
    id: existing.uniqueCode,
    active: true,
    stock: 0,
    date: existing.date,
    clientCode: existing.clientCode,
    uniqueCode: existing.uniqueCode,
    costDgUpdatedAt: null,
    publicPriceUpdatedAt: null,
    product: existing.product,
    supplier: existing.supplier,
    category: existing.category,
    publicPrice: existing.publicPrice,
    vatRate: existing.vatRate,
    markup: existing.markup,
    costDgNoVat: existing.costDgNoVat,
    freightNoVat,
    pvcNoVat,
    pvcWithVat,
    latestSupplierCostDg: 0,
    supplierCostDgDate: null,
    hasPriceAlert: false,
    segment: "active",
    pvcHistory: [],
    freightCriterion: null,
  };

  const calc = calculateSantanderCost(tempRow, defaultRates);
  allRows[idx] = {
    ...existing,
    freightNoVat,
    pvcNoVat,
    pvcWithVat,
    ppNoVat: calc.ppNoVat,
    insurance: calc.insurance,
    grossIncome: calc.grossIncome,
    debitTax: calc.debitTax,
    creditTax: calc.creditTax,
    missionsTax: calc.missionsTax,
    totalCost: calc.totalCost,
    profit: calc.profit,
    profitPercentage: calc.profitPercentage,
  };
  writeSantanderCostRowsToExcel(allRows);

  return NextResponse.json({ ok: true, profitPercentage: calc.profitPercentage, message: "Registro actualizado." });
}

export function DELETE(request: Request) {
  const url = new URL(request.url);
  const client = url.searchParams.get("client") || "";
  const uniqueCode = url.searchParams.get("uniqueCode") || "";
  const period = url.searchParams.get("period") || "";

  if (canonicalClient(client) !== "santander") {
    return NextResponse.json({ ok: false, message: "Cliente inválido." }, { status: 400 });
  }
  if (!uniqueCode || !period) {
    return NextResponse.json({ ok: false, message: "Parámetros incompletos." }, { status: 400 });
  }

  const allRows = readSantanderCostRowsFromExcel();
  const filtered = allRows.filter(
    (r) => !(r.uniqueCode === uniqueCode && r.period === period),
  );

  if (filtered.length === allRows.length) {
    return NextResponse.json({ ok: false, message: "Fila no encontrada." }, { status: 404 });
  }

  writeSantanderCostRowsToExcel(filtered);
  return NextResponse.json({ ok: true, message: "Registro eliminado." });
}
