import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient, JobStatus, StockMovementType, MovementDirection } from "@prisma/client";

// One-time ETL: Phase 3 — Santander cost structure history (CostStructureRun +
// CostStructureItem) and Santander stock snapshot (seeded as opening-balance
// StockMovement entries). Idempotent.

const prisma = new PrismaClient();

function getFolder() {
  const folder = process.env.DG_LOCAL_DB_DIR;
  if (!folder) throw new Error("DG_LOCAL_DB_DIR is not set");
  return folder;
}

function readSheetRows(fileName: string): Record<string, unknown>[] {
  const filePath = path.join(getFolder(), fileName);
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
}

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function asNumber(value: unknown) {
  const raw = asString(value).replace(/[$\s]/g, "").replace(/,/g, "");
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampDecimal7_4(value: number) {
  return Math.abs(value) >= 1000 ? 0 : value;
}

type Report = { created: number; updated: number; skipped: { row: unknown; reason: string }[] };
function newReport(): Report {
  return { created: 0, updated: 0, skipped: [] };
}
function describePrismaError(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const prismaError = error as { code?: string; meta?: { target?: unknown } };
    if (prismaError.code === "P2002") return `duplicado (${JSON.stringify(prismaError.meta?.target)})`;
    return `${prismaError.code ?? "error"} ${JSON.stringify(prismaError.meta ?? {})}`;
  }
  return error instanceof Error ? (error.message.split("\n").find((line) => line.trim()) ?? error.message) : String(error);
}
function printReport(label: string, report: Report) {
  console.log(`\n${label}: ${report.created} creados, ${report.updated} actualizados, ${report.skipped.length} omitidos`);
  for (const { row, reason } of report.skipped.slice(0, 15)) {
    console.log(`  - omitido (${reason}):`, JSON.stringify(row));
  }
  if (report.skipped.length > 15) console.log(`  ... y ${report.skipped.length - 15} más`);
}

async function migrateCostStructure(santanderClientId: string) {
  const rows = readSheetRows("Base Estructura Costos Santander DG.xlsx");
  const products = await prisma.product.findMany({ select: { id: true, internalCode: true } });
  const productsByCode = new Map(products.map((p) => [p.internalCode.toLowerCase(), p.id]));

  const report = newReport();
  const runIdByPeriod = new Map<string, string>();

  // Pass 1: one CostStructureRun per Periodo (YYYY-MM).
  const periods = new Set(rows.map((row) => asString(row["Periodo"])).filter(Boolean));
  for (const periodKey of periods) {
    const [year, month] = periodKey.split("-").map((part) => Number.parseInt(part, 10));
    if (!year || !month) continue;
    const period = new Date(Date.UTC(year, month - 1, 1));
    const existing = await prisma.costStructureRun.findUnique({
      where: { clientId_period: { clientId: santanderClientId, period } },
    });
    const run =
      existing ??
      (await prisma.costStructureRun.create({
        data: {
          clientId: santanderClientId,
          period,
          status: JobStatus.COMPLETED,
          generatedAt: period,
          completedAt: period,
          assumptions: { source: "excel-migration", file: "Base Estructura Costos Santander DG.xlsx" },
        },
      }));
    runIdByPeriod.set(periodKey, run.id);
  }
  console.log(`\nCostStructureRun: ${runIdByPeriod.size} períodos (creados o ya existentes)`);

  // Pass 2: items, deduped by (runId, productId) keeping the last row seen.
  type PendingItem = {
    runId: string;
    productId: string | null;
    activeAtPeriod: boolean;
    itemDate: Date;
    clientCode: string | null;
    uniqueCode: string;
    productName: string;
    supplierName: string | null;
    categoryName: string | null;
    publicPrice: number;
    vatRate: number;
    markup: number;
    publicPriceNoVat: number;
    costDgNoVat: number;
    insurance: number;
    grossIncomeTax: number;
    debitTax: number;
    creditTax: number;
    freightNoVat: number;
    totalCost: number;
    netSalePrice: number;
    grossSalePrice: number;
    profit: number;
    profitPercentage: number;
    missionsTax: number;
    costUpdated: boolean;
  };
  const pending: PendingItem[] = [];
  const dedupeIndex = new Map<string, number>();

  for (const row of rows) {
    const periodKey = asString(row["Periodo"]);
    const runId = runIdByPeriod.get(periodKey);
    const uniqueCode = asString(row["Codigo Unico"]);
    const productName = asString(row["Producto"]);
    if (!runId || !uniqueCode || !productName) {
      report.skipped.push({ row, reason: "sin período/código único/nombre" });
      continue;
    }
    const itemDate = new Date(asString(row["Fecha"]) || `${periodKey}-01`);
    if (Number.isNaN(itemDate.getTime())) {
      report.skipped.push({ row: { uniqueCode, periodKey }, reason: "fecha inválida" });
      continue;
    }
    const productId = productsByCode.get(uniqueCode.toLowerCase()) ?? null;

    const item: PendingItem = {
      runId,
      productId,
      activeAtPeriod: true,
      itemDate,
      clientCode: asString(row["Codigo Cliente"]) || null,
      uniqueCode,
      productName,
      supplierName: asString(row["Proveedor"]) || null,
      categoryName: asString(row["Categoria"]) || null,
      publicPrice: asNumber(row["Precio Publico"]),
      vatRate: clampDecimal7_4(asNumber(row["IVA"])),
      markup: clampDecimal7_4(asNumber(row["Mark Up"])),
      publicPriceNoVat: asNumber(row["PP s/IVA"]),
      costDgNoVat: asNumber(row["Costo DG sin iva"]),
      insurance: asNumber(row["Seguro"]),
      grossIncomeTax: asNumber(row["Ing. Brutos"]),
      debitTax: asNumber(row["Imp. Debito"]),
      creditTax: asNumber(row["Imp. Credito"]),
      freightNoVat: asNumber(row["Flete S/IVA"]),
      totalCost: asNumber(row["Costo Total"]),
      netSalePrice: asNumber(row["PVC sin IVA"]),
      grossSalePrice: asNumber(row["PVC con IVA"]),
      profit: asNumber(row["Utilidad"]),
      profitPercentage: clampDecimal7_4(asNumber(row["Porcentaje"])),
      missionsTax: asNumber(row["Impuesto Misiones"]),
      costUpdated: asString(row["Costo Actualizado"]).toUpperCase() === "OK",
    };

    // Dedupe by (run, uniqueCode) rather than (run, productId): the DB unique index is on
    // (runId, productId) and never treats two NULL productId rows as duplicates, so relying
    // on it alone would re-insert every unmatched-product row on each re-run.
    const key = `${runId}|${uniqueCode.toLowerCase()}`;
    const previous = dedupeIndex.get(key);
    if (previous !== undefined) {
      pending[previous] = item;
      continue;
    }
    dedupeIndex.set(key, pending.length);
    pending.push(item);
  }

  const existingKeys = new Set(
    (await prisma.costStructureItem.findMany({ select: { runId: true, uniqueCode: true } })).map(
      (existing) => `${existing.runId}|${existing.uniqueCode.toLowerCase()}`,
    ),
  );
  const toInsert = pending.filter((item) => !existingKeys.has(`${item.runId}|${item.uniqueCode.toLowerCase()}`));

  const batchSize = 2000;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize);
    await prisma.costStructureItem.createMany({ data: batch, skipDuplicates: true });
    console.log(`  ... ${Math.min(i + batchSize, toInsert.length)}/${toInsert.length}`);
  }
  report.created = toInsert.length;
  report.updated = pending.length - toInsert.length;
  printReport("CostStructureItem (Nota: columnas 'Peso Volumetrico', 'Bultos' y 'Origen' del Excel no tienen campo equivalente y no se migran)", report);
}

async function migrateStockSnapshot(santanderClientId: string) {
  const rows = readSheetRows("Base Stock Santander DG.xlsx");
  const products = await prisma.product.findMany({ select: { id: true, internalCode: true } });
  const productsByCode = new Map(products.map((p) => [p.internalCode.toLowerCase(), p.id]));

  const report = newReport();
  for (const row of rows) {
    const uniqueCode = asString(row["Codigo Unico"]);
    if (!uniqueCode) {
      report.skipped.push({ row, reason: "sin código único" });
      continue;
    }
    const productId = productsByCode.get(uniqueCode.toLowerCase());
    if (!productId) {
      report.skipped.push({ row: { uniqueCode }, reason: "producto no encontrado" });
      continue;
    }
    const stockRealRaw = asString(row["Stock Real"]);
    const rawQuantity = stockRealRaw ? asNumber(row["Stock Real"]) : asNumber(row["Stock Teorico"]);
    const quantity = Math.abs(rawQuantity);
    if (quantity === 0) {
      report.skipped.push({ row: { uniqueCode }, reason: "stock en cero, no corresponde crear movimiento (constraint quantity > 0)" });
      continue;
    }
    const direction = rawQuantity < 0 ? MovementDirection.OUT : MovementDirection.IN;
    const type = rawQuantity < 0 ? StockMovementType.MANUAL_ADJUSTMENT_OUT : StockMovementType.MANUAL_ADJUSTMENT_IN;
    const idempotencyKey = `migration:stock-santander:${uniqueCode.toLowerCase()}`;

    try {
      const existing = await prisma.stockMovement.findUnique({ where: { idempotencyKey } });
      const data = {
        productId,
        stockClientId: santanderClientId,
        type,
        direction,
        quantity,
        comments: "Saldo inicial migrado desde Base Stock Santander DG.xlsx (columna Stock Real)",
        metadata: {
          source: "excel-migration",
          grupo: asString(row["Grupo"]) || null,
          comentarios: asString(row["Comentarios"]) || null,
          stockInformado: asNumber(row["Stock Informado"]),
          disponeWeb: asNumber(row["Dispone WEB"]),
          stockTeorico: asNumber(row["Stock Teorico"]),
        },
      };
      if (existing) {
        report.skipped.push({ row: { uniqueCode }, reason: "ya existía (movimiento inicial no se actualiza, es un ledger)" });
      } else {
        await prisma.stockMovement.create({ data: { ...data, idempotencyKey } });
        report.created += 1;
      }
    } catch (error) {
      report.skipped.push({ row: { uniqueCode }, reason: `error de base de datos: ${describePrismaError(error)}` });
    }
  }
  printReport("StockMovement (saldo inicial Santander)", report);
}

async function main() {
  console.log("Carpeta de datos:", getFolder());
  const santander = await prisma.client.findFirst({ where: { name: { equals: "Santander", mode: "insensitive" } } });
  if (!santander) throw new Error('Cliente "Santander" no encontrado. Corré la Fase 1 primero.');
  await migrateCostStructure(santander.id);
  await migrateStockSnapshot(santander.id);
  console.log("\nFase 3 completa.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
