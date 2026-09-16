import "server-only";

import type {
  ExcelCategory,
  ExcelClient,
  ExcelClientCodeMapping,
  ExcelClientRateItem,
  ExcelPrice,
  ExcelProduct,
  ExcelSantanderCostRow,
  ExcelSantanderStockRow,
  ExcelSupplier,
  FreightCriterionEntry,
} from "@/lib/local-excel-db";
import { excelPostgres } from "@/lib/excel-postgres-client";

function text(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function number(value: { toString(): string } | number | null | undefined) {
  if (value == null) return 0;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: { toString(): string } | number | null | undefined) {
  return value == null ? null : number(value);
}

function date(value: Date | null | undefined) {
  return value?.toISOString() ?? undefined;
}

function dateOnly(value: Date | null | undefined) {
  return value?.toISOString().slice(0, 10) ?? "";
}

function normalize(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function numericId(value: string) {
  return /^\d+$/.test(value) ? BigInt(value) : null;
}

function nextPublicCode(prefix: string, codes: string[]) {
  const max = codes.reduce((current, code) => {
    const match = code.match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(6, "0")}`;
}

export async function readProductsFromPostgres(): Promise<ExcelProduct[]> {
  const rows = await excelPostgres.excelProduct.findMany({
    include: { brand: true, supplier: true, category: true },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => ({
    id: row.id.toString(),
    code: text(row.uniqueCode),
    name: text(row.product),
    active: row.active,
    brand: text(row.brand?.name ?? row.brandOriginal),
    supplier: text(row.supplier?.supplier ?? row.supplierOriginal),
    supplierCode: text(row.supplierUniqueCode),
    category: text(row.category?.category ?? row.categoryOriginal),
    unitsPerPackage: nullableNumber(row.packageSize),
    createdAt: date(row.sourceCreatedAt),
    updatedAt: date(row.sourceUpdatedAt),
  }));
}

export async function writeProductsToPostgres(products: ExcelProduct[]) {
  const [brands, suppliers, categories, existing] = await Promise.all([
    excelPostgres.excelBrand.findMany(),
    excelPostgres.excelSupplier.findMany(),
    excelPostgres.excelCategory.findMany(),
    excelPostgres.excelProduct.findMany({ select: { id: true } }),
  ]);
  const brandByName = new Map(brands.map((row) => [normalize(row.name), row.id]));
  const supplierByName = new Map(
    suppliers.map((row) => [normalize(text(row.supplier)), row.id]),
  );
  const categoryByName = new Map(
    categories.map((row) => [normalize(text(row.category)), row.id]),
  );
  const existingIds = new Set(existing.map((row) => row.id.toString()));
  await excelPostgres.$transaction(
    async (transaction) => {
      for (const product of products) {
        const id = numericId(product.id);
        const data = {
          product: product.name.trim(),
          uniqueCode: product.code.trim(),
          active: product.active,
          supplierUniqueCode: product.supplierCode.trim() || null,
          brandOriginal: product.brand.trim() || null,
          supplierOriginal: product.supplier.trim() || null,
          categoryOriginal: product.category.trim() || null,
          brandId: brandByName.get(normalize(product.brand)) ?? null,
          supplierId: supplierByName.get(normalize(product.supplier)) ?? null,
          categoryId: categoryByName.get(normalize(product.category)) ?? null,
          packageSize: product.unitsPerPackage,
          sourceCreatedAt: product.createdAt ? new Date(product.createdAt) : null,
          sourceUpdatedAt: product.updatedAt ? new Date(product.updatedAt) : new Date(),
        };
        if (id && existingIds.has(id.toString())) {
          await transaction.excelProduct.update({ where: { id }, data });
        } else {
          await transaction.excelProduct.create({
            data: { ...data, legacyId: product.id || null },
          });
        }
      }
    },
    { timeout: 600_000 },
  );
  return readProductsFromPostgres();
}

export async function readSuppliersFromPostgres(): Promise<ExcelSupplier[]> {
  const rows = await excelPostgres.excelSupplier.findMany({ orderBy: { id: "asc" } });
  return rows.map((row) => ({
    id: row.id.toString(),
    name: text(row.supplier),
    active: row.active ?? false,
  }));
}

export async function writeSuppliersToPostgres(suppliers: ExcelSupplier[]) {
  const existing = await excelPostgres.excelSupplier.findMany();
  const codes = existing.map((row) => row.supplierCode);
  let nextCode = nextPublicCode("PRV", codes);
  await excelPostgres.$transaction(async (transaction) => {
    for (const supplier of suppliers) {
      const id = numericId(supplier.id);
      const data = { supplier: supplier.name.trim(), active: supplier.active };
      if (id && existing.some((row) => row.id === id)) {
        await transaction.excelSupplier.update({ where: { id }, data });
      } else {
        await transaction.excelSupplier.create({
          data: { ...data, supplierCode: nextCode, legacyId: supplier.id || null },
        });
        const numeric = Number(nextCode.split("-")[1]) + 1;
        nextCode = `PRV-${String(numeric).padStart(6, "0")}`;
      }
    }
  });
  return readSuppliersFromPostgres();
}

export async function readCategoriesFromPostgres(): Promise<ExcelCategory[]> {
  const rows = await excelPostgres.excelCategory.findMany({ orderBy: { id: "asc" } });
  return rows.map((row) => ({
    id: row.id.toString(),
    name: text(row.category),
    active: row.active ?? false,
  }));
}

export async function writeCategoriesToPostgres(categories: ExcelCategory[]) {
  const existing = await excelPostgres.excelCategory.findMany();
  let nextCode = nextPublicCode("CAT", existing.map((row) => row.categoryCode));
  await excelPostgres.$transaction(async (transaction) => {
    for (const category of categories) {
      const id = numericId(category.id);
      const data = { category: category.name.trim(), active: category.active };
      if (id && existing.some((row) => row.id === id)) {
        await transaction.excelCategory.update({ where: { id }, data });
      } else {
        await transaction.excelCategory.create({
          data: { ...data, categoryCode: nextCode, legacyId: category.id || null },
        });
        const numeric = Number(nextCode.split("-")[1]) + 1;
        nextCode = `CAT-${String(numeric).padStart(6, "0")}`;
      }
    }
  });
  return readCategoriesFromPostgres();
}

export async function readClientsFromPostgres(): Promise<ExcelClient[]> {
  const rows = await excelPostgres.excelClient.findMany({ orderBy: { id: "asc" } });
  return rows.map((row) => ({
    id: row.id.toString(),
    name: text(row.name),
    active: row.active ?? false,
    createdAt: date(row.sourceCreatedAt),
  }));
}

export async function writeClientsToPostgres(clients: ExcelClient[]) {
  const existing = await excelPostgres.excelClient.findMany({ select: { id: true } });
  await excelPostgres.$transaction(async (transaction) => {
    for (const client of clients) {
      const id = numericId(client.id);
      const data = {
        name: client.name.trim(),
        active: client.active,
        sourceCreatedAt: client.createdAt ? new Date(client.createdAt) : null,
      };
      if (id && existing.some((row) => row.id === id)) {
        await transaction.excelClient.update({ where: { id }, data });
      } else {
        await transaction.excelClient.create({
          data: { ...data, legacyId: client.id || null },
        });
      }
    }
  });
  return readClientsFromPostgres();
}

export async function readClientRatesFromPostgres(): Promise<ExcelClientRateItem[]> {
  const [rows, clients] = await Promise.all([
    excelPostgres.excelClientRate.findMany({ orderBy: { id: "asc" } }),
    excelPostgres.excelClient.findMany({ select: { id: true, legacyId: true } }),
  ]);
  const clientIdByLegacyId = new Map(
    clients
      .filter((client) => client.legacyId)
      .map((client) => [client.legacyId as string, client.id.toString()]),
  );
  const currentClientIds = new Set(clients.map((client) => client.id.toString()));
  return rows.map((row) => ({
    id: row.id.toString(),
    clientId: currentClientIds.has(text(row.clientLegacyId))
      ? text(row.clientLegacyId)
      : clientIdByLegacyId.get(text(row.clientLegacyId)) ?? text(row.clientLegacyId),
    clientName: text(row.client),
    effectiveFrom: dateOnly(row.validFrom).slice(0, 7),
    rateName: text(row.rateName),
    rateKey: text(row.key),
    applies: row.applies ?? false,
    valuePct: number(row.percentageValue),
    appliesTo: text(row.appliesTo) === "COSTO" ? "COSTO" : "PRECIO",
    sortOrder: row.sortOrder ?? 0,
    createdAt: date(row.sourceCreatedAt),
  }));
}

export async function writeClientRatesToPostgres(items: ExcelClientRateItem[]) {
  await excelPostgres.$transaction(async (transaction) => {
    await transaction.excelClientRate.deleteMany();
    if (items.length) {
      await transaction.excelClientRate.createMany({
        data: items.map((item) => ({
          legacyId: item.id,
          clientLegacyId: item.clientId,
          client: item.clientName,
          validFrom: new Date(`${item.effectiveFrom}-01T00:00:00.000Z`),
          rateName: item.rateName,
          key: item.rateKey,
          applies: item.applies,
          percentageValue: item.valuePct,
          appliesTo: item.appliesTo,
          sortOrder: item.sortOrder,
          sourceCreatedAt: item.createdAt ? new Date(item.createdAt) : null,
        })),
      });
    }
  });
}

export async function readClientCodesFromPostgres(): Promise<ExcelClientCodeMapping[]> {
  const rows = await excelPostgres.excelClientCode.findMany({ orderBy: { id: "asc" } });
  return rows.map((row) => ({
    id: row.id.toString(),
    client: text(row.client),
    uniqueCode: text(row.uniqueCode),
    clientCode: text(row.clientCode),
    assignedMonth: row.assignmentMonth ?? 0,
    assignedYear: row.assignmentYear ?? 0,
    active: row.active ?? false,
    reactivatedAt: date(row.reactivatedAt),
    correctedAt: date(row.correctedAt),
    correctionReason: text(row.correctionReason) || undefined,
    voidedAt: date(row.voidedAt),
    voidReason: text(row.voidReason) || undefined,
  }));
}

export async function writeClientCodesToPostgres(items: ExcelClientCodeMapping[]) {
  await excelPostgres.$transaction(async (transaction) => {
    await transaction.excelClientCode.deleteMany();
    if (items.length) {
      await transaction.excelClientCode.createMany({
        data: items.map((item) => ({
          legacyId: item.id,
          client: item.client,
          uniqueCode: item.uniqueCode,
          clientCode: item.clientCode,
          assignmentMonth: item.assignedMonth,
          assignmentYear: item.assignedYear,
          active: item.active,
          reactivatedAt: item.reactivatedAt ? new Date(item.reactivatedAt) : null,
          correctedAt: item.correctedAt ? new Date(item.correctedAt) : null,
          correctionReason: item.correctionReason ?? null,
          voidedAt: item.voidedAt ? new Date(item.voidedAt) : null,
          voidReason: item.voidReason ?? null,
        })),
      });
    }
  });
  return readClientCodesFromPostgres();
}

export async function readPricesFromPostgres(): Promise<ExcelPrice[]> {
  const rows = await excelPostgres.excelPrice.findMany({ orderBy: { id: "asc" } });
  return rows.map((row) => ({
    id: row.id.toString(),
    supplier: text(row.supplier),
    uniqueCode: text(row.uniqueCode),
    informedAt:
      row.year && row.month && row.day
        ? `${row.year}-${String(row.month).padStart(2, "0")}-${String(row.day).padStart(2, "0")}`
        : "",
    missingFields: [...(row.vat == null ? ["vatRate" as const] : []), ...(row.markup == null ? ["markup" as const] : [])],
    costDg: number(row.dgCost),
    vatRate: number(row.vat),
    publicPrice: number(row.publicPrice),
    markup: number(row.markup),
  }));
}

export async function upsertPricesToPostgres(prices: ExcelPrice[]) {
  await excelPostgres.$transaction(
    async (transaction) => {
      for (const price of prices) {
        const id = numericId(price.id);
        const [year, month, day] = price.informedAt.split("-").map(Number);
        const data = {
          supplier: price.supplier,
          uniqueCode: price.uniqueCode,
          year: year || null,
          month: month || null,
          day: day || 1,
          dgCost: price.costDg,
          vat: price.vatRate,
          publicPrice: price.publicPrice,
          markup: price.markup,
        };
        if (id) {
          const exists = await transaction.excelPrice.findUnique({ where: { id } });
          if (exists) {
            await transaction.excelPrice.update({ where: { id }, data });
            continue;
          }
        }
        await transaction.excelPrice.create({
          data: { ...data, legacyId: price.id || null },
        });
      }
    },
    { timeout: 600_000 },
  );
}

export async function deletePricesFromPostgres(ids: string[]) {
  const numericIds = ids
    .map(numericId)
    .filter((id): id is bigint => id !== null);
  if (!numericIds.length) return 0;
  const result = await excelPostgres.excelPrice.deleteMany({
    where: { id: { in: numericIds } },
  });
  return result.count;
}

export async function readSantanderCostsFromPostgres(): Promise<ExcelSantanderCostRow[]> {
  const rows = await excelPostgres.excelSantanderCost.findMany({ orderBy: { id: "asc" } });
  return rows.map((row) => ({
    client: text(row.client), period: text(row.period), month: row.month ?? 0, year: row.year ?? 0,
    date: dateOnly(row.date), clientCode: text(row.clientCode), uniqueCode: text(row.uniqueCode),
    costUpdated: text(row.updatedCost), product: text(row.product), supplier: text(row.supplier),
    category: text(row.category), publicPrice: number(row.publicPrice), vatRate: number(row.vat),
    markup: number(row.markup), ppNoVat: number(row.publicPriceNoVat), costDgNoVat: number(row.dgCostNoVat),
    insurance: number(row.insurance), grossIncome: number(row.grossIncomeTax), debitTax: number(row.debitTax),
    creditTax: number(row.creditTax), freightNoVat: number(row.freightNoVat), totalCost: number(row.totalCost),
    pvcNoVat: number(row.salePriceNoVat), pvcWithVat: number(row.salePriceWithVat), profit: number(row.profit),
    profitPercentage: number(row.percentage), missionsTax: number(row.missionsTax),
    volumetricWeight: number(row.volumetricWeight), unitsPerPackage: number(row.packages), source: text(row.origin),
  }));
}

export async function replaceSantanderCostsInPostgres(rows: ExcelSantanderCostRow[]) {
  await excelPostgres.$transaction(async (transaction) => {
    await transaction.excelSantanderCost.deleteMany();
    for (let index = 0; index < rows.length; index += 1000) {
      await transaction.excelSantanderCost.createMany({
        data: rows.slice(index, index + 1000).map((row) => ({
          client: row.client, period: row.period, month: row.month, year: row.year,
          date: row.date ? new Date(`${row.date}T00:00:00.000Z`) : null,
          clientCode: row.clientCode, uniqueCode: row.uniqueCode, updatedCost: row.costUpdated,
          product: row.product, supplier: row.supplier, category: row.category,
          publicPrice: row.publicPrice, vat: row.vatRate, markup: row.markup,
          publicPriceNoVat: row.ppNoVat, dgCostNoVat: row.costDgNoVat, insurance: row.insurance,
          grossIncomeTax: row.grossIncome, debitTax: row.debitTax, creditTax: row.creditTax,
          freightNoVat: row.freightNoVat, totalCost: row.totalCost, salePriceNoVat: row.pvcNoVat,
          salePriceWithVat: row.pvcWithVat, profit: row.profit, percentage: row.profitPercentage,
          missionsTax: row.missionsTax, volumetricWeight: row.volumetricWeight,
          packages: row.unitsPerPackage, origin: row.source,
        })),
      });
    }
  }, { timeout: 600_000 });
}

export async function upsertSantanderCostsInPostgres(rows: ExcelSantanderCostRow[]) {
  await excelPostgres.$transaction(async (transaction) => {
    for (const row of rows) {
      await transaction.excelSantanderCost.deleteMany({
        where: {
          client: row.client,
          period: row.period,
          uniqueCode: row.uniqueCode,
        },
      });
      await transaction.excelSantanderCost.create({
        data: {
          client: row.client, period: row.period, month: row.month, year: row.year,
          date: row.date ? new Date(`${row.date}T00:00:00.000Z`) : null,
          clientCode: row.clientCode, uniqueCode: row.uniqueCode, updatedCost: row.costUpdated,
          product: row.product, supplier: row.supplier, category: row.category,
          publicPrice: row.publicPrice, vat: row.vatRate, markup: row.markup,
          publicPriceNoVat: row.ppNoVat, dgCostNoVat: row.costDgNoVat, insurance: row.insurance,
          grossIncomeTax: row.grossIncome, debitTax: row.debitTax, creditTax: row.creditTax,
          freightNoVat: row.freightNoVat, totalCost: row.totalCost, salePriceNoVat: row.pvcNoVat,
          salePriceWithVat: row.pvcWithVat, profit: row.profit, percentage: row.profitPercentage,
          missionsTax: row.missionsTax, volumetricWeight: row.volumetricWeight,
          packages: row.unitsPerPackage, origin: row.source,
        },
      });
    }
  }, { timeout: 600_000 });
}

export async function readFreightCriteriaFromPostgres() {
  const rows = await excelPostgres.excelFreightCriterion.findMany();
  const store: Record<string, FreightCriterionEntry[]> = {};
  for (const row of rows) {
    const code = text(row.uniqueCode);
    if (!code) continue;
    store[code] = [...(store[code] ?? []), {
      mode: row.mode === "fixed" ? "fixed" : "pct",
      value: number(row.value), effectiveFrom: text(row.validFrom),
    }];
  }
  return store;
}

export async function upsertFreightCriterionInPostgres(uniqueCode: string, entry: FreightCriterionEntry) {
  const existing = await excelPostgres.excelFreightCriterion.findFirst({
    where: { uniqueCode, validFrom: entry.effectiveFrom },
  });
  const data = { uniqueCode, mode: entry.mode, value: entry.value, validFrom: entry.effectiveFrom };
  if (existing) await excelPostgres.excelFreightCriterion.update({ where: { id: existing.id }, data });
  else await excelPostgres.excelFreightCriterion.create({ data });
}

export async function readSantanderStockFromPostgres(): Promise<ExcelSantanderStockRow[]> {
  const rows = await excelPostgres.excelSantanderStock.findMany({ orderBy: { id: "asc" } });
  return rows.map((row) => ({
    client: text(row.client), group: text(row.group), comments: text(row.comments),
    clientCode: text(row.clientCode), uniqueCode: text(row.uniqueCode), product: text(row.product),
    supplier: text(row.supplier), category: text(row.category), totalOrder: number(row.totalOrdered),
    physicalIncome: number(row.physicalIncome), egress: number(row.egress), theoreticalStock: number(row.theoreticalStock),
    realStock: number(row.realStock), pendingDeliveries: number(row.pendingDeliveries),
    totalTransactions: number(row.totalTransactions), firstIncomeDate: dateOnly(row.firstIncomeDate),
    reportedStock: number(row.informedStock), webAvailable: number(row.availableOnWeb), adjustment: number(row.adjustment),
    validity: number(row.validity), transactionsPerDay: number(row.transactionsPerDay), stockDays: number(row.stockDays),
    requiredStock: number(row.requiredStock), surplusShortage: number(row.surplusShortage),
    surplusShortageByPackage: number(row.packageSurplusShortage), percentage: number(row.percentage),
    quantity: number(row.quantity), packageSize: number(row.packageSize), finalPurchase: number(row.finalPurchase),
    costDgNoVat: number(row.dgCostNoVat), totalCost: number(row.totalCost), stockValue: number(row.valuedStock),
    unitProfit: number(row.unitProfit), totalProfit: number(row.totalProfit), salePrice: number(row.salePrice),
    remaining: number(row.remaining),
  }));
}
