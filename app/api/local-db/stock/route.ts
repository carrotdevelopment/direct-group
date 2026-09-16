import { checkApiAccess } from "@/server/lib/access";
﻿import { NextResponse } from "next/server";
import {
  readClientCodesFromExcel,
  readProductsFromExcel,
  readSantanderCostRowsFromExcel,
  readSantanderStockRowsFromExcel,
} from "@/lib/local-excel-db";
import { readEgressRows, readIncomeRows } from "@/lib/operation-excel-db";
import { usesPostgres } from "@/lib/data-source";
import {
  readClientCodesFromPostgres,
  readProductsFromPostgres,
  readSantanderCostsFromPostgres,
  readSantanderStockFromPostgres,
} from "@/lib/postgres-replica-db";
import {
  readStockOperationRowsFromPostgres,
} from "@/lib/postgres-operation-db";

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

function latestCostByCode(
  targetPeriod: number,
  costRows: ReturnType<typeof readSantanderCostRowsFromExcel>,
) {
  const map = new Map<
    string,
    ReturnType<typeof readSantanderCostRowsFromExcel>[number]
  >();
  for (const row of costRows) {
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

export async function GET(request: Request) {
  const denied = await checkApiAccess(["stock"], false);
  if (denied) return denied;
  const url = new URL(request.url);
  const client = url.searchParams.get("client") || "";
  const today = new Date();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  const targetPeriod = periodIndex(year, month);

  if (canonicalClient(client) !== "santander") {
    return NextResponse.json({
      rows: [],
      message: "Por ahora solo está cargada la vista de stock Santander.",
    });
  }

  const postgres = usesPostgres();
  const [mappingRows, productRows, persistedStockRows, costRows] = postgres
    ? await Promise.all([
        readClientCodesFromPostgres(),
        readProductsFromPostgres(),
        readSantanderStockFromPostgres(),
        readSantanderCostsFromPostgres(),
      ])
    : [
        readClientCodesFromExcel(),
        readProductsFromExcel(),
        readSantanderStockRowsFromExcel(),
        readSantanderCostRowsFromExcel(),
      ];
  const operationRows = postgres
    ? await readStockOperationRowsFromPostgres()
    : {
        incomes: readIncomeRows({ client: "santander", limit: Number.MAX_SAFE_INTEGER }),
        egresses: readEgressRows({ client: "Santander", limit: Number.MAX_SAFE_INTEGER }),
      };
  const incomeRows = operationRows.incomes;
  const egressRows = operationRows.egresses;

  // All non-voided Santander assignments up to today
  const allMappings = mappingRows.filter(
    (m) =>
      canonicalClient(m.client) === "santander" &&
      !m.voidedAt &&
      periodIndex(m.assignedYear, m.assignedMonth) <= targetPeriod,
  );

  // Active: most recent active assignment per uniqueCode
  type Mapping = (typeof allMappings)[number];
  const activeByCode = new Map<string, Mapping>();
  for (const m of allMappings) {
    if (!m.active) continue;
    const key = normalizeCode(m.uniqueCode);
    const current = activeByCode.get(key);
    const mPeriod = periodIndex(m.assignedYear, m.assignedMonth);
    if (!current || mPeriod > periodIndex(current.assignedYear, current.assignedMonth)) {
      activeByCode.set(key, m);
    }
  }

  // Inactive: most recent inactive per uniqueCode that has no active counterpart
  const activeKeys = new Set([...activeByCode.keys()]);
  const inactiveByCode = new Map<string, Mapping>();
  for (const m of allMappings) {
    if (m.active) continue;
    const key = normalizeCode(m.uniqueCode);
    if (activeKeys.has(key)) continue;
    const current = inactiveByCode.get(key);
    const mPeriod = periodIndex(m.assignedYear, m.assignedMonth);
    if (!current || mPeriod > periodIndex(current.assignedYear, current.assignedMonth)) {
      inactiveByCode.set(key, m);
    }
  }

  const assignments = [
    ...[...activeByCode.values()].map((m) => ({ ...m, vigente: true })),
    ...[...inactiveByCode.values()].map((m) => ({ ...m, vigente: false })),
  ].sort((a, b) => a.clientCode.localeCompare(b.clientCode, "es", { numeric: true }));
  const products = new Map(
    productRows.filter((product) => product.active).map((product) => [
      normalizeCode(product.code),
      product,
    ]),
  );
  const stockRows = persistedStockRows;
  const stockByClientCode = new Map(
    stockRows.map((row) => [normalizeCode(row.clientCode), row]),
  );
  const stockByUniqueCode = new Map(
    stockRows.map((row) => [normalizeCode(row.uniqueCode), row]),
  );
  const incomes = incomeRows;
  const egresses = egressRows as Array<Record<string, unknown>>;
  const costs = latestCostByCode(targetPeriod, costRows);
  const incomeOps = new Set(["COMPRA", "PASAJE", "ROBO/AJUSTE", "DEVOLUCION"]);
  const incomeDateOps = new Set(["COMPRA", "PASAJE"]);
  const egressOps = new Set(["CANJE", "ROBO/AJUSTE", "PASAJE", "CAMBIO"]);
  const incomesByClientCode = new Map<string, Array<Record<string, unknown>>>();
  for (const row of incomes) {
    const key = normalizeCode(
      text(pick(row, ["Código Cliente", "CÃ³digo Cliente", "Codigo Cliente"])),
    );
    if (!key) continue;
    const grouped = incomesByClientCode.get(key) ?? [];
    grouped.push(row);
    incomesByClientCode.set(key, grouped);
  }
  const egressesByClientCode = new Map<string, Array<Record<string, unknown>>>();
  for (const row of egresses) {
    const key = normalizeCode(text(pick(row, ["SKU"])));
    if (!key) continue;
    const grouped = egressesByClientCode.get(key) ?? [];
    grouped.push(row);
    egressesByClientCode.set(key, grouped);
  }

  const rows = assignments.map((assignment) => {
    const stock =
      stockByClientCode.get(normalizeCode(assignment.clientCode)) ||
      stockByUniqueCode.get(normalizeCode(assignment.uniqueCode));
    const product = products.get(normalizeCode(assignment.uniqueCode));
    const clientCode = normalizeCode(assignment.clientCode);
    const matchingIncomes = incomesByClientCode.get(clientCode) ?? [];
    const matchingEgresses = egressesByClientCode.get(clientCode) ?? [];
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
      vigente: assignment.vigente,
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

  const vigentes = rows.filter((r) => r.vigente).length;
  const withStockData = rows.filter((r) => r.hasStockData).length;
  return NextResponse.json({
    rows,
    message: `${vigentes} productos vigentes Santander · ${withStockData} con datos de stock cargados.`,
    source: usesPostgres() ? "postgresql" : "excel",
  });
}
