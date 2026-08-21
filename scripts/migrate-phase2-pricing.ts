import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";

// One-time ETL: Phase 2 — SupplierPrice (from "Base Precios DG") and
// ClientRateConfig (from "Base Config Tasas Clientes DG"). Idempotent.

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

function asBool(value: unknown) {
  return asString(value).toLowerCase() === "si";
}

function asIntOrNull(value: unknown) {
  const raw = asString(value);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

type PriceJsonRow = {
  id: string;
  supplier: string;
  uniqueCode: string;
  informedAt: string;
  costDg: number;
  vatRate: number;
  publicPrice: number;
  markup: number;
};

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

async function migrateSupplierPrices() {
  const jsonPath = path.join(getFolder(), "Base Precios DG.json");
  const rows = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as PriceJsonRow[];
  console.log(`\nLeyendo ${rows.length} precios desde el JSON sidecar...`);

  const products = await prisma.product.findMany({ select: { id: true, internalCode: true } });
  const productsByCode = new Map(products.map((p) => [p.internalCode.toLowerCase(), p.id]));
  const suppliers = await prisma.supplier.findMany({ select: { id: true, name: true } });
  const suppliersByName = new Map(suppliers.map((s) => [s.name.toLowerCase(), s.id]));

  const report = newReport();
  type PendingRow = {
    productId: string;
    supplierId: string;
    validFrom: Date;
    informedAt: Date;
    cost: number;
    vatRate: number;
    publicCost: number | null;
    markup: number | null;
    currency: "ARS";
  };
  const pending: PendingRow[] = [];
  const seenKeys = new Set<string>();

  for (const row of rows) {
    if (!row.uniqueCode || !row.supplier || !row.informedAt) {
      report.skipped.push({ row, reason: "faltan campos obligatorios" });
      continue;
    }
    const productId = productsByCode.get(row.uniqueCode.toLowerCase());
    if (!productId) {
      report.skipped.push({ row: { id: row.id, uniqueCode: row.uniqueCode }, reason: "producto no encontrado" });
      continue;
    }
    const supplierId = suppliersByName.get(row.supplier.toLowerCase());
    if (!supplierId) {
      report.skipped.push({ row: { id: row.id, supplier: row.supplier }, reason: "proveedor no encontrado" });
      continue;
    }
    const validFrom = new Date(`${row.informedAt}T00:00:00.000Z`);
    if (Number.isNaN(validFrom.getTime())) {
      report.skipped.push({ row: { id: row.id, informedAt: row.informedAt }, reason: "fecha inválida" });
      continue;
    }
    // vatRate/markup are Decimal(7,4): |value| must be < 1000, otherwise Postgres rejects the whole batch.
    const vatRate = row.vatRate ?? 21;
    const markup = row.markup ?? null;
    if (Math.abs(vatRate) >= 1000 || (markup !== null && Math.abs(markup) >= 1000)) {
      report.skipped.push({ row: { id: row.id, vatRate, markup }, reason: "vatRate o markup fuera de rango (|valor| >= 1000)" });
      continue;
    }
    // Same source file can carry more than one entry for the same product/supplier/day;
    // keep the last one seen (the JSON sidecar preserves the original row order).
    const key = `${productId}|${supplierId}|${validFrom.toISOString()}`;
    if (seenKeys.has(key)) {
      const previousIndex = pending.findIndex(
        (item) => item.productId === productId && item.supplierId === supplierId && item.validFrom.getTime() === validFrom.getTime(),
      );
      if (previousIndex >= 0) pending.splice(previousIndex, 1);
    } else {
      seenKeys.add(key);
    }
    pending.push({
      productId,
      supplierId,
      validFrom,
      informedAt: validFrom,
      cost: row.costDg ?? 0,
      vatRate,
      publicCost: row.publicPrice ?? null,
      markup,
      currency: "ARS",
    });
  }

  const beforeCount = await prisma.supplierPrice.count();
  const batchSize = 2000;
  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    await prisma.supplierPrice.createMany({ data: batch, skipDuplicates: true });
    console.log(`  ... ${Math.min(i + batchSize, pending.length)}/${pending.length}`);
  }
  const afterCount = await prisma.supplierPrice.count();
  report.created = afterCount - beforeCount;
  report.updated = pending.length - report.created;
  printReport("Precios de proveedor", report);
}

async function migrateClientRateConfigs() {
  const rows = readSheetRows("Base Config Tasas Clientes DG.xlsx");
  const clients = await prisma.client.findMany({ select: { id: true, name: true } });
  const clientsByName = new Map(clients.map((c) => [c.name.toLowerCase(), c.id]));

  const report = newReport();
  for (const row of rows) {
    const clientName = asString(row["Cliente"]);
    const key = asString(row["Clave"]);
    const name = asString(row["Nombre Tasa"]);
    const vigenteDesde = asString(row["Vigente Desde"]);
    if (!clientName || !key || !name || !vigenteDesde) {
      report.skipped.push({ row, reason: "faltan campos obligatorios" });
      continue;
    }
    const clientId = clientsByName.get(clientName.toLowerCase());
    if (!clientId) {
      report.skipped.push({ row, reason: `cliente "${clientName}" no encontrado` });
      continue;
    }
    const [year, month] = vigenteDesde.split("-").map((part) => Number.parseInt(part, 10));
    if (!year || !month) {
      report.skipped.push({ row, reason: `"Vigente Desde" inválido: "${vigenteDesde}"` });
      continue;
    }
    const validFrom = new Date(Date.UTC(year, month - 1, 1));
    const data = {
      name,
      active: asBool(row["Aplica"]),
      value: Number.parseFloat(asString(row["Valor %"]).replace(",", ".")) || 0,
      appliesTo: asString(row["Aplica Sobre"]) || "COSTO",
      order: asIntOrNull(row["Orden"]) ?? 0,
    };

    try {
      const existing = await prisma.clientRateConfig.findUnique({
        where: { clientId_key_validFrom: { clientId, key, validFrom } },
      });
      if (existing) {
        await prisma.clientRateConfig.update({ where: { id: existing.id }, data });
        report.updated += 1;
      } else {
        await prisma.clientRateConfig.create({ data: { clientId, key, validFrom, ...data } });
        report.created += 1;
      }
    } catch (error) {
      report.skipped.push({ row, reason: `error de base de datos: ${describePrismaError(error)}` });
    }
  }
  printReport("Tasas de cliente", report);
}

async function main() {
  console.log("Carpeta de datos:", getFolder());
  await migrateSupplierPrices();
  await migrateClientRateConfigs();
  console.log("\nFase 2 completa.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
