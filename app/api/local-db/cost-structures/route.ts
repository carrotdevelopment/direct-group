import { checkApiAccess } from "@/server/lib/access";
﻿import { NextResponse } from "next/server";
import {
  type ExcelPrice,
  type ExcelSantanderCostRow,
  getActiveCriterion,
  type FreightCriterionEntry,
} from "@/lib/local-excel-db";
import { calculate, selectRateConfig, type CostRate } from "@/lib/cost-structure-calculation";
import {
  readClientCodesFromPostgres,
  readClientsFromPostgres,
  readClientRatesFromPostgres,
  readFreightCriteriaFromPostgres,
  readPricesFromPostgres,
  readProductsFromPostgres,
  readSantanderCostsFromPostgres,
  replaceSantanderCostsInPostgres,
  upsertSantanderCostsInPostgres,
  upsertFreightCriterionInPostgres,
} from "@/lib/postgres-replica-db";


export const runtime = "nodejs";

type CostStructureRow = {
  id: string;
  active: boolean;
  stock: number;
  date: string;
  clientCode: string;
  uniqueCode: string;
  costDgUpdatedAt: string | null;
  pvcUpdatedAt: string | null;
  previousAdjustment?: { period: string; freightNoVat: number; pvcNoVat: number; pvcWithVat: number } | null;
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
    .filter((price) => pricePeriod(price) <= targetPeriod && Number.isFinite(price[field]) &&
      ((field === "vatRate" || field === "markup") ? price[field] >= 0 && !price.missingFields?.includes(field) : price[field] > 0))
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

async function ratesForPeriod(client: string, period: string): Promise<CostRate[]> {
  const [clients, rates] = await Promise.all([readClientsFromPostgres(), readClientRatesFromPostgres()]);
  const owner = clients.find(c => canonicalClient(c.name) === canonicalClient(client));
  const items = rates.filter(r => r.clientId === owner?.id);
  const config = selectRateConfig(items, period);
  return config ? items.filter(r => r.effectiveFrom === config.effectiveFrom && r.applies) : [];
}

function calculateSantanderCost(row: CostStructureRow, rates: CostRate[]) {
  const calc = calculate(row, rates.filter(r => r.appliesTo === "COSTO"), rates.filter(r => r.appliesTo === "PRECIO"));
  const charges = [...calc.costoBreakdown, ...calc.precioBreakdown];
  const amount = (key: string) => roundMoney(charges.filter(r => r.rateKey === key).reduce((sum,r) => sum + r.amount, 0));
  return { ...calc, profitPercentage: calc.profitPct,
    insurance: amount("seguro"), grossIncome: amount("ingresos_brutos"),
    debitTax: amount("impuesto_debito"), creditTax: amount("impuesto_credito"), missionsTax: amount("impuesto_misiones") };
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

export async function GET(request: Request) {
  const denied = await checkApiAccess(["precios"], false);
  if (denied) return denied;
  const url = new URL(request.url);
  const client = url.searchParams.get("client") || "";
  const historyFor = url.searchParams.get("historyFor") || "";
  const today = new Date();

  if (canonicalClient(client) !== "santander") {
    return NextResponse.json({
      rows: [],
      message: "Por ahora solo está cargada la estructura real de Santander.",
    });
  }

  const [assignmentSource, productSource, priceSource, allCostRows, freightCriteriaStore] =
    await Promise.all([
          readClientCodesFromPostgres(),
          readProductsFromPostgres(),
          readPricesFromPostgres(),
          readSantanderCostsFromPostgres(),
          readFreightCriteriaFromPostgres(),
        ]);

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
    const matched = allCostRows
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
  const allAssignments = assignmentSource.filter(
    (mapping) => canonicalClient(mapping.client) === "santander" &&
      !mapping.voidedAt && periodIndex(mapping.assignedYear, mapping.assignedMonth) <= targetPeriod,
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
    productSource
      .filter((product) => product.active)
      .map((product) => [product.code, product]),
  );
  const pricesByUniqueCode = new Map<string, ExcelPrice[]>();
  for (const price of priceSource) {
    const code = normalizeCode(price.uniqueCode);
    const current = pricesByUniqueCode.get(code) ?? [];
    current.push(price);
    pricesByUniqueCode.set(code, current);
  }

  // Latest saved cost row per uniqueCode, up to the requested period
  const latestCosts = latestByUniqueCode(
    allCostRows,
    (row) => periodIndex(row.year, row.month),
    targetPeriod,
  );
  // Reference columns show the latest saved adjustment, not the selected period.
  const latestAdjustments = latestByUniqueCode(
    allCostRows,
    row => periodIndex(row.year, row.month),
    Number.POSITIVE_INFINITY,
  );

  // Freight criteria — keyed by uniqueCode
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
      const previous = latestAdjustments.get(assignment.uniqueCode);
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
        pvcUpdatedAt: cost?.period ?? null,
        previousAdjustment: previous ? {
          period: previous.period, freightNoVat: previous.freightNoVat,
          pvcNoVat: previous.pvcNoVat, pvcWithVat: previous.pvcWithVat,
        } : null,
        product: cost?.product || product?.name || "",
        supplier: cost?.supplier || product?.supplier || "",
        category: cost?.category || product?.category || "",
        publicPrice: valueFromPrice(publicPricePrice?.publicPrice, cost?.publicPrice ?? 0),
        vatRate: vatPrice?.vatRate ?? cost?.vatRate ?? 21,
        markup: markupPrice?.markup ?? cost?.markup ?? 0,
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
    source: "postgresql",
  });
}

export async function PUT(request: Request) {
  const denied = await checkApiAccess(["precios"], true);
  if (denied) return denied;
  const body = (await request.json()) as {
    client?: string;
    month?: number;
    year?: number;
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
  const rates = await ratesForPeriod(client, period);
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
        row.pvcUpdatedAt?.startsWith(period)
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

  await upsertSantanderCostsInPostgres(nextRows);

  // Persist freight criteria for rows where one was applied this session
  for (const row of rows) {
    if (row.freightMode && row.freightValue != null) {
      const entry = {
        mode: row.freightMode,
        value: row.freightValue,
        effectiveFrom: period,
      } as const;
      await upsertFreightCriterionInPostgres(row.uniqueCode, entry);
    }
  }

  return NextResponse.json({
    ok: true,
    rows,
    message: `${rows.length} fila${rows.length === 1 ? "" : "s"} de Santander ${period} guardada${rows.length === 1 ? "" : "s"}.`,
    source: "postgresql",
  });
}

export async function PATCH(request: Request) {
  const denied = await checkApiAccess(["precios"], true);
  if (denied) return denied;
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

  const allRows = await readSantanderCostsFromPostgres();
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
    pvcUpdatedAt: null,
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

  const calc = calculateSantanderCost(tempRow, await ratesForPeriod(body.client!, period));
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
  await upsertSantanderCostsInPostgres([allRows[idx]]);

  return NextResponse.json({ ok: true, profitPercentage: calc.profitPercentage, message: "Registro actualizado." });
}

export async function DELETE(request: Request) {
  const denied = await checkApiAccess(["precios"], true);
  if (denied) return denied;
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

  const allRows = await readSantanderCostsFromPostgres();
  const filtered = allRows.filter(
    (r) => !(r.uniqueCode === uniqueCode && r.period === period),
  );

  if (filtered.length === allRows.length) {
    return NextResponse.json({ ok: false, message: "Fila no encontrada." }, { status: 404 });
  }

  await replaceSantanderCostsInPostgres(filtered);
  return NextResponse.json({ ok: true, message: "Registro eliminado." });
}
