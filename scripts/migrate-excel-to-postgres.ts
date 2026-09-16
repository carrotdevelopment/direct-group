import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import * as XLSX from "xlsx";
import { PrismaClient } from "../node_modules/.prisma/excel-client";

loadEnvConfig(process.cwd());

type Row = Record<string, unknown>;
type DataRow = Record<string, unknown>;
type IdMap = Map<string, bigint>;

type CreateManyDelegate = {
  createMany(args: {
    data: DataRow[];
    skipDuplicates?: boolean;
  }): Promise<{ count: number }>;
};

const dryRun = process.argv.includes("--dry-run");
const folder = process.env.DG_LOCAL_DB_DIR;
if (!folder) throw new Error("DG_LOCAL_DB_DIR no esta configurada");
if (!dryRun && !process.env.EXCEL_DATABASE_URL) {
  throw new Error("EXCEL_DATABASE_URL no esta configurada");
}

const dataFolder = path.resolve(folder);
const prisma = new PrismaClient();
const workbookCache = new Map<string, LoadedWorkbook>();

type LoadedWorkbook = {
  fileName: string;
  filePath: string;
  checksum: string;
  modifiedAt: Date;
  workbook: XLSX.WorkBook;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function readWorkbook(fileName: string) {
  const cached = workbookCache.get(fileName);
  if (cached) return cached;
  const filePath = path.join(dataFolder, fileName);
  const buffer = fs.readFileSync(filePath);
  const loaded: LoadedWorkbook = {
    fileName,
    filePath,
    checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
    modifiedAt: fs.statSync(filePath).mtime,
    workbook: XLSX.read(buffer, { type: "buffer", cellDates: false, cellFormula: true }),
  };
  workbookCache.set(fileName, loaded);
  return loaded;
}

function readRows(fileName: string, sheetName: string) {
  const loaded = readWorkbook(fileName);
  const sheet = loaded.workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`No existe ${fileName} / ${sheetName}`);
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: "", raw: true });
}

function get(row: Row, header: string) {
  const target = normalize(header);
  const key = Object.keys(row).find((candidate) => normalize(candidate) === target);
  return key ? row[key] : undefined;
}

function asText(value: unknown) {
  const result = String(value ?? "").trim();
  return result || null;
}

function asNumber(value: unknown, context: string) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    throw new Error(`${context}: numero no finito`);
  }
  let raw = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/ARS/gi, "")
    .replace(/\$/g, "")
    .replace(/%$/, "");
  if (!raw) return null;
  if (/^[-–—]+$/.test(raw)) return null;
  const negativeInParentheses = /^\(.*\)$/.test(raw);
  if (negativeInParentheses) raw = raw.slice(1, -1);
  if (raw.includes(",") && raw.includes(".")) {
    raw = raw.lastIndexOf(",") > raw.lastIndexOf(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (raw.includes(",")) {
    raw = /^-?[1-9]\d{0,2}(,\d{3})+$/.test(raw)
      ? raw.replace(/,/g, "")
      : raw.replace(",", ".");
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${context}: numero invalido "${String(value)}"`);
  return negativeInParentheses ? -parsed : parsed;
}

function asNumberWithRawFallback(value: unknown, context: string) {
  try {
    return { value: asNumber(value, context), original: null, warning: null };
  } catch (error) {
    return {
      value: null,
      original: String(value ?? ""),
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

function asInteger(value: unknown, context: string) {
  const raw = String(value ?? "").trim();
  const excelDayFormattedAsDate = raw.match(/^(\d{1,2})\/1\/(?:00|1900)$/);
  if (excelDayFormattedAsDate) return Number(excelDayFormattedAsDate[1]);
  const parsed = asNumber(value, context);
  return parsed == null ? null : Math.trunc(parsed);
}

function asCalendarPart(value: unknown, part: "day" | "month" | "year", context: string) {
  const parsed = asInteger(value, context);
  if (parsed == null) return null;
  if (parsed > 10_000) {
    const excelDate = XLSX.SSF.parse_date_code(parsed);
    if (excelDate) {
      if (part === "day") return excelDate.d;
      if (part === "month") return excelDate.m;
      return excelDate.y;
    }
  }
  return parsed;
}

function asBoolean(value: unknown, context: string) {
  const raw = normalize(value);
  if (!raw) return null;
  if (["SI", "TRUE", "1"].includes(raw)) return true;
  if (["NO", "FALSE", "0"].includes(raw)) return false;
  throw new Error(`${context}: booleano invalido "${String(value)}"`);
}

function asDate(value: unknown, context: string) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) throw new Error(`${context}: fecha Excel invalida "${value}"`);
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S)));
  }
  const raw = String(value).trim();
  const isoDate = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/;
  const localDate = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/;
  if (isoDate.test(raw)) {
    const parsed = new Date(raw.length === 10 ? `${raw}T00:00:00.000Z` : raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const match = raw.match(localDate);
  if (match) return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  throw new Error(`${context}: fecha invalida "${raw}"`);
}

function publicCode(prefix: string, position: number) {
  return `${prefix}-${String(position + 1).padStart(6, "0")}`;
}

function withMetadata(data: DataRow, index: number) {
  return { ...data, sourceRowNumber: index + 2 };
}

function chunks<T>(items: T[], size = 1000) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function getOrCreateSourceFile(loaded: LoadedWorkbook) {
  const existing = await prisma.excelSourceFile.findFirst({
    where: { fileName: loaded.fileName, checksumSha256: loaded.checksum },
  });
  if (existing) return existing;
  return prisma.excelSourceFile.create({
    data: {
      fileName: loaded.fileName,
      relativePath: path.relative(process.cwd(), loaded.filePath),
      checksumSha256: loaded.checksum,
      fileModifiedAt: loaded.modifiedAt,
    },
  });
}

async function importRows(options: {
  fileName: string;
  sheetName: string;
  delegateName: string;
  rows: DataRow[];
}) {
  const { fileName, sheetName, delegateName, rows } = options;
  if (dryRun) {
    console.log(`[DRY] ${fileName} / ${sheetName} -> ${delegateName}: ${rows.length} filas`);
    return;
  }

  const source = await getOrCreateSourceFile(readWorkbook(fileName));
  const completed = await prisma.excelImportBatch.findFirst({
    where: { sourceFileId: source.id, sheetName, status: "COMPLETED" },
  });
  if (completed) {
    console.log(`[OMITIDO] ${fileName} / ${sheetName}: checksum ya importado`);
    return;
  }

  const batch = await prisma.excelImportBatch.create({
    data: { sourceFileId: source.id, sheetName, status: "PROCESSING", totalRows: rows.length },
  });

  try {
    const inserted = await prisma.$transaction(
      async (transaction) => {
        const delegate = (transaction as unknown as Record<string, CreateManyDelegate>)[delegateName];
        if (!delegate) throw new Error(`Delegate Prisma desconocido: ${delegateName}`);
        let count = 0;
        for (const group of chunks(rows)) {
          const result = await delegate.createMany({
            data: group.map((row) => ({ ...row, importBatchId: batch.id })),
          });
          count += result.count;
        }
        return count;
      },
      { timeout: 600_000, maxWait: 30_000 },
    );
    await prisma.excelImportBatch.update({
      where: { id: batch.id },
      data: {
        status: "COMPLETED",
        importedRows: inserted,
        rejectedRows: rows.length - inserted,
        finishedAt: new Date(),
      },
    });
    console.log(`[OK] ${fileName} / ${sheetName} -> ${delegateName}: ${inserted} filas`);
  } catch (error) {
    await prisma.excelImportBatch.update({
      where: { id: batch.id },
      data: {
        status: "FAILED",
        rejectedRows: rows.length,
        finishedAt: new Date(),
        errorDetail: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

function masterMap<T extends { id: bigint }>(rows: T[], getName: (row: T) => string | null) {
  const result: IdMap = new Map();
  for (const row of rows) {
    const key = normalize(getName(row));
    if (key && !result.has(key)) result.set(key, row.id);
  }
  return result;
}

async function migrateMasters() {
  const categoryRows = readRows("Base Categorias DG.xlsx", "Categorias").map((row, index) =>
    withMetadata(
      {
        legacyId: asText(get(row, "ID")),
        categoryCode: publicCode("CAT", index),
        category: asText(get(row, "Categoria")),
        active: asBoolean(get(row, "Activo"), `Categorias fila ${index + 2}`),
      },
      index,
    ),
  );
  await importRows({
    fileName: "Base Categorias DG.xlsx",
    sheetName: "Categorias",
    delegateName: "excelCategory",
    rows: categoryRows,
  });

  const supplierRows = readRows("Base Proveedores DG.xlsx", "Proveedores").map((row, index) =>
    withMetadata(
      {
        supplierCode: publicCode("PRV", index),
        legacyId: asText(get(row, "ID")),
        supplier: asText(get(row, "Proveedor")),
        active: asBoolean(get(row, "Activo"), `Proveedores fila ${index + 2}`),
      },
      index,
    ),
  );
  await importRows({
    fileName: "Base Proveedores DG.xlsx",
    sheetName: "Proveedores",
    delegateName: "excelSupplier",
    rows: supplierRows,
  });

  const clientRows = readRows("Base Clientes DG.xlsx", "Clientes").map((row, index) =>
    withMetadata(
      {
        legacyId: asText(get(row, "ID")),
        name: asText(get(row, "Nombre")),
        active: asBoolean(get(row, "Activo"), `Clientes fila ${index + 2}`),
        sourceCreatedAt: asDate(get(row, "Creado"), `Clientes fila ${index + 2}`),
      },
      index,
    ),
  );
  await importRows({
    fileName: "Base Clientes DG.xlsx",
    sheetName: "Clientes",
    delegateName: "excelClient",
    rows: clientRows,
  });

  const rawProducts = readRows("Base Productos DG.xlsx", "Productos");
  const brandNames = new Map<string, string>();
  for (const row of rawProducts) {
    const name = asText(get(row, "Marca"));
    const key = normalize(name);
    if (name && key && !brandNames.has(key)) brandNames.set(key, name);
  }
  const brandRows = [...brandNames.values()]
    .sort((left, right) => normalize(left).localeCompare(normalize(right)))
    .map((name, index) => ({ brandCode: publicCode("MAR", index), name, active: true }));
  await importRows({
    fileName: "Base Productos DG.xlsx",
    sheetName: "Productos [marcas derivadas]",
    delegateName: "excelBrand",
    rows: brandRows,
  });

  let categories: IdMap = new Map();
  let suppliers: IdMap = new Map();
  let brands: IdMap = new Map();
  if (!dryRun) {
    categories = masterMap(await prisma.excelCategory.findMany(), (row) => row.category);
    suppliers = masterMap(await prisma.excelSupplier.findMany(), (row) => row.supplier);
    brands = masterMap(await prisma.excelBrand.findMany(), (row) => row.name);
  }

  const productRows = rawProducts.map((row, index) => {
    const brandOriginal = asText(get(row, "Marca"));
    const supplierOriginal = asText(get(row, "Proveedor"));
    const categoryOriginal = asText(get(row, "Categoria"));
    return withMetadata(
      {
        legacyId: asText(get(row, "ID")),
        product: asText(get(row, "Producto")),
        active:
          asBoolean(get(row, "Activo"), `Productos fila ${index + 2}`) ?? true,
        brandId: dryRun ? null : brands.get(normalize(brandOriginal)) ?? null,
        brandOriginal,
        uniqueCode: asText(get(row, "Codigo Unico")),
        supplierUniqueCode: asText(get(row, "Cod. Unico Prov.")),
        supplierId: dryRun ? null : suppliers.get(normalize(supplierOriginal)) ?? null,
        supplierOriginal,
        categoryId: dryRun ? null : categories.get(normalize(categoryOriginal)) ?? null,
        categoryOriginal,
        packageSize: asNumber(get(row, "Bulto"), `Productos fila ${index + 2}`),
        sourceCreatedAt: asDate(get(row, "Creado"), `Productos fila ${index + 2}`),
        sourceUpdatedAt: asDate(get(row, "Actualizado"), `Productos fila ${index + 2}`),
      },
      index,
    );
  });
  await importRows({
    fileName: "Base Productos DG.xlsx",
    sheetName: "Productos",
    delegateName: "excelProduct",
    rows: productRows,
  });
}

async function migrateClientCodesAndRates() {
  const codeRows = readRows("Base Codigo Cliente DG.xlsx", "Codigos Cliente").map((row, index) =>
    withMetadata(
      {
        legacyId: asText(get(row, "ID")),
        client: asText(get(row, "Cliente")),
        uniqueCode: asText(get(row, "Codigo Unico")),
        clientCode: asText(get(row, "Codigo Cliente")),
        assignmentMonth: asInteger(get(row, "Mes Asignacion"), `Codigos Cliente fila ${index + 2}`),
        assignmentYear: asInteger(get(row, "Año Asignacion"), `Codigos Cliente fila ${index + 2}`),
        active: asBoolean(get(row, "Activo"), `Codigos Cliente fila ${index + 2}`),
        reactivatedAt: asDate(get(row, "Reactivado"), `Codigos Cliente fila ${index + 2}`),
        correctedAt: asDate(get(row, "Corregido"), `Codigos Cliente fila ${index + 2}`),
        correctionReason: asText(get(row, "Motivo Correccion")),
        voidedAt: asDate(get(row, "Anulado"), `Codigos Cliente fila ${index + 2}`),
        voidReason: asText(get(row, "Motivo Anulacion")),
      },
      index,
    ),
  );
  await importRows({
    fileName: "Base Codigo Cliente DG.xlsx",
    sheetName: "Codigos Cliente",
    delegateName: "excelClientCode",
    rows: codeRows,
  });

  const rateRows = readRows("Base Config Tasas Clientes DG.xlsx", "Tasas").map((row, index) =>
    withMetadata(
      {
        legacyId: asText(get(row, "ID")),
        clientLegacyId: asText(get(row, "Cliente ID")),
        client: asText(get(row, "Cliente")),
        validFrom: asDate(get(row, "Vigente Desde"), `Tasas fila ${index + 2}`),
        rateName: asText(get(row, "Nombre Tasa")),
        key: asText(get(row, "Clave")),
        applies: asBoolean(get(row, "Aplica"), `Tasas fila ${index + 2}`),
        percentageValue: asNumber(get(row, "Valor %"), `Tasas fila ${index + 2}`),
        appliesTo: asText(get(row, "Aplica Sobre")),
        sortOrder: asInteger(get(row, "Orden"), `Tasas fila ${index + 2}`),
        sourceCreatedAt: asDate(get(row, "Creado"), `Tasas fila ${index + 2}`),
      },
      index,
    ),
  );
  await importRows({
    fileName: "Base Config Tasas Clientes DG.xlsx",
    sheetName: "Tasas",
    delegateName: "excelClientRate",
    rows: rateRows,
  });
}

async function migratePrices() {
  const rows = readRows("Base Precios DG.xlsx", "Precios").map((row, index) =>
    withMetadata(
      {
        legacyId: asText(get(row, "ID")),
        supplier: asText(get(row, "Proveedor")),
        uniqueCode: asText(get(row, "Codigo Unico")),
        day: asCalendarPart(get(row, "Dia"), "day", `Precios fila ${index + 2}`),
        month: asCalendarPart(get(row, "Mes"), "month", `Precios fila ${index + 2}`),
        year: asCalendarPart(get(row, "Año"), "year", `Precios fila ${index + 2}`),
        dgCost: asNumber(get(row, "Costo DG"), `Precios fila ${index + 2}`),
        vat: asNumber(get(row, "IVA"), `Precios fila ${index + 2}`),
        publicPrice: asNumber(get(row, "Precio Publico"), `Precios fila ${index + 2}`),
        markup: asNumber(get(row, "Mark Up"), `Precios fila ${index + 2}`),
      },
      index,
    ),
  );
  await importRows({ fileName: "Base Precios DG.xlsx", sheetName: "Precios", delegateName: "excelPrice", rows });
}

async function migrateIncomes() {
  const rows = readRows("Base Ingresos DG.xlsx", "Ingresos").map((row, index) =>
    withMetadata(
      {
        client: asText(get(row, "Cliente")),
        operation: asText(get(row, "Operacion")),
        orderDay: asCalendarPart(get(row, "Dia pedido"), "day", `Ingresos fila ${index + 2}`),
        orderMonth: asCalendarPart(get(row, "Mes pedido"), "month", `Ingresos fila ${index + 2}`),
        orderYear: asCalendarPart(get(row, "Año pedido"), "year", `Ingresos fila ${index + 2}`),
        purchaseOrder: asText(get(row, "Orden de compra")),
        clientCode: asText(get(row, "Codigo Cliente")),
        quantity: asNumber(get(row, "Cantidad"), `Ingresos fila ${index + 2}`),
        transferOrigin: asText(get(row, "Origen del pasaje")),
        deliveryDay: asCalendarPart(get(row, "Dia entrega"), "day", `Ingresos fila ${index + 2}`),
        deliveryMonth: asCalendarPart(get(row, "Mes entrega"), "month", `Ingresos fila ${index + 2}`),
        deliveryYear: asCalendarPart(get(row, "Año entrega"), "year", `Ingresos fila ${index + 2}`),
        deliveredQuantity: asNumber(get(row, "Entregado"), `Ingresos fila ${index + 2}`),
        comments: asText(get(row, "Comentarios")),
      },
      index,
    ),
  );
  await importRows({ fileName: "Base Ingresos DG.xlsx", sheetName: "Ingresos", delegateName: "excelIncome", rows });
}

async function migrateEgresses() {
  const rows = readRows("Base Egresos Santander DG.xlsx", "Santander").map((row, index) => {
    const quantity = asNumberWithRawFallback(get(row, "Cantidad"), `Egresos fila ${index + 2}`);
    return withMetadata(
      {
        day: asCalendarPart(get(row, "Dia"), "day", `Egresos fila ${index + 2}`),
        month: asCalendarPart(get(row, "Mes"), "month", `Egresos fila ${index + 2}`),
        year: asCalendarPart(get(row, "Año"), "year", `Egresos fila ${index + 2}`),
        guideNumber: asText(get(row, "Nro guia")),
        date: asDate(get(row, "Fecha"), `Egresos fila ${index + 2}`),
        legacyId: asText(get(row, "ID")),
        sku: asText(get(row, "SKU")),
        locality: asText(get(row, "Localidad")),
        province: asText(get(row, "Provincia")),
        postalCode: asText(get(row, "CP")),
        quantity: quantity.value,
        quantityOriginal: quantity.original,
        migrationWarning: quantity.warning,
        operation: asText(get(row, "Operacion")),
        destination: asText(get(row, "Destino")),
        comment: asText(get(row, "Comentario")),
      },
      index,
    );
  });
  await importRows({
    fileName: "Base Egresos Santander DG.xlsx",
    sheetName: "Santander",
    delegateName: "excelSantanderEgress",
    rows,
  });
}

async function migrateCostsAndFreight() {
  const fileName = "Base Estructura Costos Santander DG.xlsx";
  const rows = readRows(fileName, "Santander").map((row, index) =>
    withMetadata(
      {
        client: asText(get(row, "Cliente")), period: asText(get(row, "Periodo")),
        month: asInteger(get(row, "Mes"), `Costos fila ${index + 2}`),
        year: asInteger(get(row, "Anio"), `Costos fila ${index + 2}`),
        date: asDate(get(row, "Fecha"), `Costos fila ${index + 2}`),
        clientCode: asText(get(row, "Codigo Cliente")), uniqueCode: asText(get(row, "Codigo Unico")),
        updatedCost: asText(get(row, "Costo Actualizado")),
        product: asText(get(row, "Producto")), supplier: asText(get(row, "Proveedor")),
        category: asText(get(row, "Categoria")),
        publicPrice: asNumber(get(row, "Precio Publico"), `Costos fila ${index + 2}`),
        vat: asNumber(get(row, "IVA"), `Costos fila ${index + 2}`),
        markup: asNumber(get(row, "Mark Up"), `Costos fila ${index + 2}`),
        publicPriceNoVat: asNumber(get(row, "PP s/IVA"), `Costos fila ${index + 2}`),
        dgCostNoVat: asNumber(get(row, "Costo DG sin iva"), `Costos fila ${index + 2}`),
        insurance: asNumber(get(row, "Seguro"), `Costos fila ${index + 2}`),
        grossIncomeTax: asNumber(get(row, "Ing. Brutos"), `Costos fila ${index + 2}`),
        debitTax: asNumber(get(row, "Imp. Debito"), `Costos fila ${index + 2}`),
        creditTax: asNumber(get(row, "Imp. Credito"), `Costos fila ${index + 2}`),
        freightNoVat: asNumber(get(row, "Flete S/IVA"), `Costos fila ${index + 2}`),
        totalCost: asNumber(get(row, "Costo Total"), `Costos fila ${index + 2}`),
        salePriceNoVat: asNumber(get(row, "PVC sin IVA"), `Costos fila ${index + 2}`),
        salePriceWithVat: asNumber(get(row, "PVC con IVA"), `Costos fila ${index + 2}`),
        profit: asNumber(get(row, "Utilidad"), `Costos fila ${index + 2}`),
        percentage: asNumber(get(row, "Porcentaje"), `Costos fila ${index + 2}`),
        missionsTax: asNumber(get(row, "Impuesto Misiones"), `Costos fila ${index + 2}`),
        volumetricWeight: asNumber(get(row, "Peso Volumetrico"), `Costos fila ${index + 2}`),
        packages: asNumber(get(row, "Bultos"), `Costos fila ${index + 2}`), origin: asText(get(row, "Origen")),
      },
      index,
    ),
  );
  await importRows({ fileName, sheetName: "Santander", delegateName: "excelSantanderCost", rows });

  const workbook = readWorkbook(fileName).workbook;
  if (workbook.Sheets["Criterios Flete"]) {
    const freightRows = readRows(fileName, "Criterios Flete").map((row, index) =>
      withMetadata(
        {
          uniqueCode: asText(get(row, "Codigo Unico")), mode: asText(get(row, "Modo")),
          value: asNumber(get(row, "Valor"), `Criterios Flete fila ${index + 2}`),
          validFrom: asText(get(row, "Vigente Desde")),
        },
        index,
      ),
    );
    await importRows({ fileName, sheetName: "Criterios Flete", delegateName: "excelFreightCriterion", rows: freightRows });
  } else {
    console.log("[OK] Criterios Flete: hoja ausente, tabla queda vacia");
  }
}

async function migrateStock() {
  const numberFields: Array<[string, string]> = [
    ["totalOrdered", "Pedido Total"], ["physicalIncome", "Ingreso Fisico"], ["egress", "Egreso"],
    ["theoreticalStock", "Stock Teorico"], ["realStock", "Stock Real"], ["pendingDeliveries", "Entregas Pendientes"],
    ["totalTransactions", "Transacciones Totales"], ["informedStock", "Stock Informado"], ["adjustment", "Ajuste"],
    ["transactionsPerDay", "Transacciones Por Dia"], ["stockDays", "Dias de Stock"], ["requiredStock", "Stock Necesario"],
    ["surplusShortage", "Sobra/Falta"], ["packageSurplusShortage", "Sobra/Falta Segun Bulto"], ["percentage", "Porcentaje"],
    ["quantity", "Cantidad"], ["packageSize", "Bulto"], ["finalPurchase", "Compra Final"],
    ["dgCostNoVat", "Costo DG S/IVA"], ["totalCost", "Total Costo"], ["valuedStock", "Stock Valorizado"],
    ["unitProfit", "Utilidad Unitaria"], ["totalProfit", "Utilidad Total"], ["salePrice", "PV"], ["remaining", "Restantes"],
  ];
  const rows = readRows("Base Stock Santander DG.xlsx", "Santander").map((row, index) => {
    const data: DataRow = {
      client: asText(get(row, "Cliente")), group: asText(get(row, "Grupo")), comments: asText(get(row, "Comentarios")),
      clientCode: asText(get(row, "Codigo Cliente")), product: asText(get(row, "Producto")),
      supplier: asText(get(row, "Proveedor")), uniqueCode: asText(get(row, "Codigo Unico")), category: asText(get(row, "Categoria")),
      firstIncomeDate: asDate(get(row, "Fecha Primer Ingreso"), `Stock fila ${index + 2}`),
      availableOnWeb: asNumber(get(row, "Dispone WEB"), `Stock fila ${index + 2} / Dispone WEB`),
      validity: asNumber(get(row, "Vigencia"), `Stock fila ${index + 2} / Vigencia`),
    };
    for (const [field, header] of numberFields) data[field] = asNumber(get(row, header), `Stock fila ${index + 2} / ${header}`);
    return withMetadata(data, index);
  });
  await importRows({
    fileName: "Base Stock Santander DG.xlsx", sheetName: "Santander", delegateName: "excelSantanderStock", rows,
  });
}

async function migrateTango() {
  const fileName = "Consulta ingresos Tango.xlsx";
  const clients = readRows(fileName, "DB_Clientes 1").map((row, index) =>
    withMetadata({ client: asText(get(row, "Cliente")), clientCode: asText(get(row, "Codigo Cliente")) }, index),
  );
  await importRows({ fileName, sheetName: "DB_Clientes 1", delegateName: "tangoClient", rows: clients });

  const incomes = readRows(fileName, "Consulta1").map((row, index) =>
    withMetadata(
      {
        client: asText(get(row, "DB_Clientes 1.Cliente")), operation: asText(get(row, "Operacion")),
        orderDate: asDate(get(row, "FechaPedido"), `Tango Consulta1 fila ${index + 2}`),
        purchaseOrder: asText(get(row, "OrdenDeCompra")), clientCode: asText(get(row, "CodigoCliente")),
        quantity: asNumber(get(row, "Cantidad"), `Tango Consulta1 fila ${index + 2}`),
        transferOrigin: asText(get(row, "OrigenDelPasaje")),
        deliveryDate: asDate(get(row, "FechaEntrega"), `Tango Consulta1 fila ${index + 2}`),
        deliveredQuantity: asNumber(get(row, "Entregado"), `Tango Consulta1 fila ${index + 2}`),
        comments: asText(get(row, "Comentarios")),
      },
      index,
    ),
  );
  await importRows({ fileName, sheetName: "Consulta1", delegateName: "tangoIncome", rows: incomes });
}

async function main() {
  console.log(dryRun ? "Modo: DRY RUN (sin escrituras)" : "Modo: MIGRACION LOCAL");
  console.log(`Fuente: ${dataFolder}`);
  await migrateMasters();
  await migrateClientCodesAndRates();
  await migratePrices();
  await migrateIncomes();
  await migrateEgresses();
  await migrateCostsAndFreight();
  await migrateStock();
  await migrateTango();
  console.log(dryRun ? "Dry run completo." : "Migracion local completa.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
