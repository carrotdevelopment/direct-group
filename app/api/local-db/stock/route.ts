import { NextResponse } from "next/server";
import {
  readClientCodesFromExcel,
  readProductsFromExcel,
  readSantanderCostRowsFromExcel,
  readSantanderStockRowsFromExcel,
} from "@/lib/local-excel-db";
import { readEgressRows, readIncomeRows } from "@/lib/operation-excel-db";

export const runtime = "nodejs";

function canonicalClient(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeCode(value: string) {
  return value.trim().toLowerCase();
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function pick(row: Record<string, unknown>, aliases: string[]) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) return row[alias];
  }
  const normalizedAliases = new Set(
    aliases.map((alias) =>
      alias
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""),
    ),
  );
  const entry = Object.entries(row).find(([key]) =>
    normalizedAliases.has(
      key
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""),
    ),
  );
  return entry?.[1] ?? "";
}

function number(value: unknown) {
  const parsed = Number(text(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function operation(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function dateFromParts(day: unknown, month: unknown, year: unknown) {
  const d = number(day);
  const m = number(month);
  const y = number(year);
  if (!d || !m || !y) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function displayDate(date: Date | null) {
  if (!date) return "";
  return `${String(date.getDate()).padStart(2, "0")}/${String(
    date.getMonth() + 1,
  ).padStart(2, "0")}/${date.getFullYear()}`;
}

function daysBetween(from: Date | null, to: Date) {
  if (!from) return 0;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

function periodIndex(year: number, month: number) {
  return year * 12 + month;
}

function periodLabel(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function latestCostByCode(targetPeriod: number) {
  const map = new Map<
    string,
    ReturnType<typeof readSantanderCostRowsFromExcel>[number]
  >();
  for (const row of readSantanderCostRowsFromExcel()) {
    const rowPeriod = periodIndex(row.year, row.month);
    if (rowPeriod > targetPeriod) continue;
    const keys = [row.clientCode, row.uniqueCode]
      .map(normalizeCode)
      .filter(Boolean);
    for (const key of keys) {
      const current = map.get(key);
      if (!current || rowPeriod > periodIndex(current.year, current.month)) {
        map.set(key, row);
      }
    }
  }
  return map;
}

export function GET(request: Request) {
  const url = new URL(request.url);
  const client = url.searchParams.get("client") || "";
  const today = new Date();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  const targetPeriod = periodIndex(year, month);
  const targetPeriodLabel = periodLabel(year, month);

  if (canonicalClient(client) !== "santander") {
    return NextResponse.json({
      rows: [],
      message: "Por ahora solo esta cargada la vista real de stock Santander.",
    });
  }
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
  const assignmentSourceLabel = assignmentSourcePeriod
    ? periodLabel(assignmentSourceYear, assignmentSourceMonth)
    : targetPeriodLabel;

  const assignments = santanderAssignments
    .filter(
      (mapping) =>
        mapping.month === assignmentSourceMonth &&
        mapping.year === assignmentSourceYear,
    )
    .sort((left, right) =>
      left.clientCode.localeCompare(right.clientCode, "es", {
        numeric: true,
      }),
    );
  const products = new Map(
    readProductsFromExcel().map((product) => [
      normalizeCode(product.code),
      product,
    ]),
  );
  const stockRows = readSantanderStockRowsFromExcel();
  const stockByClientCode = new Map(
    stockRows.map((row) => [normalizeCode(row.clientCode), row]),
  );
  const stockByUniqueCode = new Map(
    stockRows.map((row) => [normalizeCode(row.uniqueCode), row]),
  );
  const incomes = readIncomeRows({
    client: "santander",
    limit: Number.MAX_SAFE_INTEGER,
  });
  const egresses = readEgressRows({
    client: "Santander",
    limit: Number.MAX_SAFE_INTEGER,
  }) as Array<Record<string, unknown>>;
  const costs = latestCostByCode(targetPeriod);
  const incomeOps = new Set(["COMPRA", "PASAJE", "ROBO/AJUSTE", "DEVOLUCION"]);
  const incomeDateOps = new Set(["COMPRA", "PASAJE"]);
  const egressOps = new Set(["CANJE", "ROBO/AJUSTE", "PASAJE", "CAMBIO"]);

  const rows = assignments.map((assignment) => {
    const stock =
      stockByClientCode.get(normalizeCode(assignment.clientCode)) ||
      stockByUniqueCode.get(normalizeCode(assignment.uniqueCode));
    const product = products.get(normalizeCode(assignment.uniqueCode));
    const clientCode = normalizeCode(assignment.clientCode);
    const matchingIncomes = incomes.filter(
      (row) =>
        normalizeCode(
          text(
            pick(row, ["Código Cliente", "CÃ³digo Cliente", "Codigo Cliente"]),
          ),
        ) === clientCode,
    );
    const matchingEgresses = egresses.filter(
      (row) => normalizeCode(text(pick(row, ["SKU"]))) === clientCode,
    );
    const totalOrder = matchingIncomes
      .filter((row) =>
        incomeOps.has(operation(pick(row, ["Operación", "OperaciÃ³n"]))),
      )
      .reduce((sum, row) => sum + number(pick(row, ["Cantidad"])), 0);
    const physicalIncome = matchingIncomes
      .filter((row) =>
        incomeOps.has(operation(pick(row, ["Operación", "OperaciÃ³n"]))),
      )
      .reduce((sum, row) => sum + number(pick(row, ["Entregado"])), 0);
    const egress = matchingEgresses
      .filter((row) =>
        egressOps.has(operation(pick(row, ["Operación", "OperaciÃ³n"]))),
      )
      .reduce((sum, row) => sum + number(pick(row, ["Cantidad"])), 0);
    const totalTransactions = matchingEgresses
      .filter(
        (row) => operation(pick(row, ["Operación", "OperaciÃ³n"])) === "CANJE",
      )
      .reduce((sum, row) => sum + number(pick(row, ["Cantidad"])), 0);
    const firstIncome =
      matchingIncomes
        .filter(
          (row) =>
            incomeDateOps.has(
              operation(pick(row, ["Operación", "OperaciÃ³n"])),
            ) &&
            text(pick(row, ["Día entrega", "DÃ­a entrega", "Dia entrega"])),
        )
        .map((row) =>
          dateFromParts(
            pick(row, ["Día entrega", "DÃ­a entrega", "Dia entrega"]),
            pick(row, ["Mes entrega"]),
            pick(row, ["Año entrega", "AÃ±o entrega", "Anio entrega"]),
          ),
        )
        .filter((date): date is Date => Boolean(date))
        .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
    const theoreticalStock = totalOrder - egress;
    const realStock = physicalIncome - egress;
    const pendingDeliveries = theoreticalStock - realStock;
    const validity = daysBetween(firstIncome, today);
    const transactionsPerDay =
      validity === 0 ? 0 : totalTransactions / validity;
    const stockDays =
      transactionsPerDay === 0 ? 0 : theoreticalStock / transactionsPerDay;
    const cost =
      costs.get(normalizeCode(assignment.clientCode)) ||
      costs.get(normalizeCode(assignment.uniqueCode));
    const packageSize = stock?.packageSize || cost?.unitsPerPackage || 1;
    const reportedStock = stock?.reportedStock || realStock;
    const webAvailable = reportedStock - totalTransactions;
    const adjustment = realStock - webAvailable;
    return {
      id: `${assignment.clientCode}-${assignment.uniqueCode}`,
      clientCode: assignment.clientCode,
      uniqueCode: assignment.uniqueCode,
      product: stock?.product || product?.name || "",
      supplier: stock?.supplier || product?.supplier || "",
      category: stock?.category || product?.category || "",
      group: stock?.group || "",
      comments: stock?.comments || "",
      totalOrder,
      physicalIncome,
      egress,
      theoreticalStock,
      realStock,
      pendingDeliveries,
      totalTransactions,
      firstIncomeDate: displayDate(firstIncome),
      reportedStock,
      webAvailable,
      adjustment,
      validity,
      transactionsPerDay,
      stockDays,
      requiredStock: null,
      surplusShortage: null,
      surplusShortageByPackage: null,
      finalPurchase: null,
      packageSize,
      costDgNoVat: cost?.costDgNoVat || stock?.costDgNoVat || 0,
      totalCost: cost?.totalCost || 0,
      stockValue: realStock * (cost?.costDgNoVat || stock?.costDgNoVat || 0),
      unitProfit: cost?.profit || stock?.unitProfit || 0,
      salePrice: cost?.pvcNoVat || stock?.salePrice || 0,
      hasStockData: Boolean(stock),
    };
  });

  return NextResponse.json({
    rows,
    message:
      assignmentSourceLabel === targetPeriodLabel
        ? `${rows.length} productos Santander a stock actual (${targetPeriodLabel}); ${rows.filter((row) => row.hasStockData).length} con datos de stock.`
        : `${rows.length} productos Santander a stock actual (${targetPeriodLabel}); se usó la asignación de ${assignmentSourceLabel}. ${rows.filter((row) => row.hasStockData).length} con datos de stock.`,
  });
}
