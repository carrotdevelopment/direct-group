import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { PrismaClient, RecordStatus } from "@prisma/client";

// One-time ETL: Phase 1 catalogs (Category, Supplier, Client, Brand, Product,
// ClientProductCode) from the legacy "BASE DE DATOS DG" Excel files into Postgres.
// Idempotent: safe to re-run, everything is upserted by a deterministic key.

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

function asDateOrUndefined(value: unknown) {
  const raw = asString(value);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

const usedCodes = new Set<string>();

function generateCode(name: string, prefix = "") {
  const base =
    prefix +
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "SIN_NOMBRE";
  let candidate = base;
  let suffix = 2;
  while (usedCodes.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  usedCodes.add(candidate);
  return candidate;
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
  return error instanceof Error ? error.message.split("\n").find((line) => line.trim()) ?? error.message : String(error);
}

function printReport(label: string, report: Report) {
  console.log(`\n${label}: ${report.created} creados, ${report.updated} actualizados, ${report.skipped.length} omitidos`);
  for (const { row, reason } of report.skipped.slice(0, 15)) {
    console.log(`  - omitido (${reason}):`, JSON.stringify(row));
  }
  if (report.skipped.length > 15) console.log(`  ... y ${report.skipped.length - 15} más`);
}

async function migrateCategories() {
  const rows = readSheetRows("Base Categorias DG.xlsx");
  const report = newReport();
  const byName = new Map<string, { id: string }>();
  for (const row of rows) {
    const name = asString(row["Categoria"]);
    if (!name) {
      report.skipped.push({ row, reason: "sin nombre" });
      continue;
    }
    const status = asBool(row["Activo"]) ? RecordStatus.ACTIVE : RecordStatus.INACTIVE;
    const existing = await prisma.category.findUnique({ where: { name } });
    const category = await prisma.category.upsert({
      where: { name },
      update: { status },
      create: { name, status },
    });
    byName.set(name, category);
    if (existing) report.updated += 1;
    else report.created += 1;
  }
  printReport("Categorías", report);
  return byName;
}

async function migrateSuppliers() {
  const rows = readSheetRows("Base Proveedores DG.xlsx");
  const report = newReport();
  const byName = new Map<string, { id: string }>();
  const seenNames = new Set<string>();
  for (const row of rows) {
    const name = asString(row["Proveedor"]);
    if (!name) {
      report.skipped.push({ row, reason: "sin nombre" });
      continue;
    }
    const key = name.toUpperCase();
    if (seenNames.has(key)) {
      report.skipped.push({ row, reason: "nombre duplicado en el Excel" });
      continue;
    }
    seenNames.add(key);
    const status = asBool(row["Activo"]) ? RecordStatus.ACTIVE : RecordStatus.INACTIVE;
    const existing = await prisma.supplier.findFirst({ where: { name } });
    const supplier = existing
      ? await prisma.supplier.update({ where: { id: existing.id }, data: { status } })
      : await prisma.supplier.create({ data: { code: generateCode(name, "PRV-"), name, status } });
    byName.set(name, supplier);
    if (existing) report.updated += 1;
    else report.created += 1;
  }
  printReport("Proveedores", report);
  return byName;
}

async function migrateClients() {
  const rows = readSheetRows("Base Clientes DG.xlsx");
  const report = newReport();
  const byName = new Map<string, { id: string }>();
  for (const row of rows) {
    const name = asString(row["Nombre"]);
    if (!name) {
      report.skipped.push({ row, reason: "sin nombre" });
      continue;
    }
    const status = asBool(row["Activo"]) ? RecordStatus.ACTIVE : RecordStatus.INACTIVE;
    const createdAt = asDateOrUndefined(row["Creado"]);
    const existing = await prisma.client.findFirst({ where: { name } });
    const client = existing
      ? await prisma.client.update({ where: { id: existing.id }, data: { status } })
      : await prisma.client.create({
          data: { code: generateCode(name, "CLI-"), name, status, ...(createdAt ? { createdAt } : {}) },
        });
    byName.set(name, client);
    if (existing) report.updated += 1;
    else report.created += 1;
  }
  printReport("Clientes", report);
  return byName;
}

async function migrateBrandsAndProducts(
  categoriesByName: Map<string, { id: string }>,
  suppliersByName: Map<string, { id: string }>,
) {
  const rows = readSheetRows("Base Productos DG.xlsx");
  // Brand.name has a case/whitespace-insensitive unique index (lower(btrim(name))),
  // so dedupe on that same normalization before upserting.
  const brandNameByKey = new Map<string, string>();
  for (const row of rows) {
    const brand = asString(row["Marca"]);
    if (!brand) continue;
    const key = brand.toLowerCase();
    if (!brandNameByKey.has(key)) brandNameByKey.set(key, brand);
  }
  const brandsByName = new Map<string, { id: string }>();
  for (const [key, name] of brandNameByKey) {
    const existing = await prisma.brand.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    const brand = existing ?? (await prisma.brand.create({ data: { name } }));
    brandsByName.set(key, brand);
  }
  console.log(`\nMarcas: ${brandNameByKey.size} distintas detectadas en Productos`);

  const report = newReport();
  for (const row of rows) {
    const internalCode = asString(row["Código Único"]);
    const name = asString(row["Producto"]);
    if (!internalCode || !name) {
      report.skipped.push({ row, reason: "sin código único o nombre" });
      continue;
    }
    const brandName = asString(row["Marca"]);
    const supplierName = asString(row["Proveedor"]);
    const categoryName = asString(row["Categoria"]);
    const brandId = brandName ? brandsByName.get(brandName.toLowerCase())?.id : undefined;
    const primarySupplierId = supplierName ? suppliersByName.get(supplierName)?.id : undefined;
    const categoryId = categoryName ? categoriesByName.get(categoryName)?.id : undefined;
    if (supplierName && !primarySupplierId) report.skipped.push({ row: { internalCode, supplierName }, reason: "proveedor no encontrado (se crea igual sin FK)" });
    if (categoryName && !categoryId) report.skipped.push({ row: { internalCode, categoryName }, reason: "categoría no encontrada (se crea igual sin FK)" });

    const data = {
      name,
      brandId,
      categoryId,
      primarySupplierId,
      unitsPerPackage: asIntOrNull(row["Bulto"]),
      supplierCode: asString(row["Cód. Único Prov."]) || null,
    };
    try {
      const existing = await prisma.product.findFirst({
        where: { internalCode: { equals: internalCode, mode: "insensitive" } },
      });
      if (existing) {
        await prisma.product.update({ where: { id: existing.id }, data });
        report.updated += 1;
      } else {
        await prisma.product.create({ data: { internalCode, ...data } });
        report.created += 1;
      }
    } catch (error) {
      const message = describePrismaError(error);
      report.skipped.push({ row: { internalCode, name, supplierName, supplierCode: data.supplierCode }, reason: `error de base de datos: ${message}` });
    }
  }
  printReport("Productos", report);
}

async function migrateClientProductCodes(clientsByName: Map<string, { id: string }>) {
  const rows = readSheetRows("Base Codigo Cliente DG.xlsx");
  const report = newReport();
  for (const row of rows) {
    const clientName = asString(row["Cliente"]);
    const uniqueCode = asString(row["Código Único"]);
    const clientCode = asString(row["Código Cliente"]);
    const month = asIntOrNull(row["Mes Asignación"]);
    const year = asIntOrNull(row["Año Asignación"]);
    if (!clientName || !uniqueCode || !clientCode || !month || !year) {
      report.skipped.push({ row, reason: "faltan campos obligatorios" });
      continue;
    }
    const client = clientsByName.get(clientName);
    if (!client) {
      report.skipped.push({ row, reason: `cliente "${clientName}" no encontrado` });
      continue;
    }
    const product = await prisma.product.findFirst({
      where: { internalCode: { equals: uniqueCode, mode: "insensitive" } },
    });
    if (!product) {
      report.skipped.push({ row, reason: `producto con código único "${uniqueCode}" no encontrado` });
      continue;
    }
    const validFrom = new Date(Date.UTC(year, month - 1, 1));
    const active = asBool(row["Activo"]);
    const correctionReason = asString(row["Motivo Corrección"]);
    const annulmentReason = asString(row["Motivo Anulación"]);
    const changeReason = [correctionReason, annulmentReason].filter(Boolean).join(" | ") || null;

    try {
    const existing = await prisma.clientProductCode.findUnique({
      where: { clientId_clientCode_validFrom: { clientId: client.id, clientCode, validFrom } },
    });
    if (existing) {
      await prisma.clientProductCode.update({
        where: { id: existing.id },
        data: { active, changeReason },
      });
      report.updated += 1;
    } else {
      await prisma.clientProductCode.create({
        data: { clientId: client.id, productId: product.id, clientCode, active, validFrom, changeReason },
      });
      report.created += 1;
    }
    } catch (error) {
      const message = describePrismaError(error);
      report.skipped.push({ row: { clientName, uniqueCode, clientCode, month, year }, reason: `error de base de datos: ${message}` });
    }
  }
  printReport("Códigos Cliente", report);
}

async function main() {
  console.log("Carpeta de datos:", getFolder());
  const categoriesByName = await migrateCategories();
  const suppliersByName = await migrateSuppliers();
  const clientsByName = await migrateClients();
  await migrateBrandsAndProducts(categoriesByName, suppliersByName);
  await migrateClientProductCodes(clientsByName);
  console.log("\nFase 1 completa.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
