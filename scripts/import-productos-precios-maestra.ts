import * as XLSX from "xlsx";
import fs from "node:fs";
import { excelPostgres } from "@/lib/excel-postgres-client-core";

// Uso: tsx scripts/import-productos-precios-maestra.ts "<1 - Consulta Base de datos.xlsm>" [--dry-run]
// Agrega a Productos y Precios lo que está en la base maestra y todavía no en PostgreSQL:
// productos por código único y precios por código único + año + mes. No modifica lo existente.
const filePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!filePath) {
  console.error('Uso: tsx scripts/import-productos-precios-maestra.ts "<archivo.xlsm>" [--dry-run]');
  process.exit(1);
}

const text = (value: unknown) => String(value ?? "").trim();
const norm = (value: unknown) => text(value).toLowerCase();
const num = (value: unknown) => {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const round = (value: number, digits = 2) => {
  const f = 10 ** digits;
  return Math.round((value + Number.EPSILON) * f) / f;
};
// En la base maestra IVA y Mark Up son multiplicadores (1,21 = 21 %; 1,6 = 60 %).
const percentFromMultiplier = (value: unknown) => {
  const n = num(value);
  if (n <= 0) return null;
  return round(n < 1 ? n * 100 : (n - 1) * 100, 3);
};

async function main() {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  // Algunos encabezados del Excel traen espacios (" Costo DG "): se leen con el nombre recortado.
  const readSheet = (name: string) =>
    XLSX.utils
      .sheet_to_json<Record<string, unknown>>(workbook.Sheets[name], { defval: "" })
      .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), value])));
  const products = readSheet("DB_Producto");
  const prices = readSheet("DB_Precios");

  // ---------- Productos
  const [dbProducts, brands, suppliers, categories] = await Promise.all([
    excelPostgres.excelProduct.findMany({ select: { uniqueCode: true } }),
    excelPostgres.excelBrand.findMany(),
    excelPostgres.excelSupplier.findMany(),
    excelPostgres.excelCategory.findMany(),
  ]);
  const haveProducts = new Set(dbProducts.map((row) => norm(row.uniqueCode)));
  const brandId = new Map(brands.map((row) => [norm(row.name), row.id]));
  const supplierId = new Map(suppliers.map((row) => [norm(row.supplier), row.id]));
  const categoryId = new Map(categories.map((row) => [norm(row.category), row.id]));

  const newProducts = new Map<string, Record<string, unknown>>();
  for (const row of products) {
    const code = norm(row["Código Único"]);
    if (!code || haveProducts.has(code) || newProducts.has(code)) continue;
    if (!text(row["Producto"]) || code.includes("revisar archivo")) continue;
    newProducts.set(code, row);
  }
  const noSupplier = [...newProducts.values()].filter((r) => !supplierId.has(norm(r["Proveedor"]))).length;
  const noCategory = [...newProducts.values()].filter((r) => !categoryId.has(norm(r["Categoría"]))).length;
  console.log(`PRODUCTOS: en el archivo ${products.length} filas | nuevos a cargar ${newProducts.size} | proveedor no existe en Proveedores: ${noSupplier} | categoría no existe: ${noCategory}`);

  // ---------- Precios
  const dbPrices = await excelPostgres.excelPrice.findMany({
    select: { uniqueCode: true, year: true, month: true, dgCost: true },
  });
  const havePrices = new Map<string, number>();
  for (const row of dbPrices) havePrices.set(`${norm(row.uniqueCode)}|${row.year}|${row.month}`, Number(row.dgCost ?? 0));

  const newPrices = new Map<string, Record<string, unknown>>();
  let junk = 0;
  let differing = 0;
  for (const row of prices) {
    const code = norm(row["Codigo Unico"]);
    const year = Number(row["Año"]);
    const month = Number(row["Mes"]);
    const cost = num(row["Costo DG"]);
    if (!code || !(year >= 2020 && year <= 2030) || !(month >= 1 && month <= 12) || cost <= 0) {
      junk += 1;
      continue;
    }
    const key = `${code}|${year}|${month}`;
    if (havePrices.has(key)) {
      if (Math.abs((havePrices.get(key) ?? 0) - cost) > 1) differing += 1;
      continue;
    }
    newPrices.set(key, row);
  }
  const byYear: Record<string, number> = {};
  for (const key of newPrices.keys()) byYear[key.split("|")[1]] = (byYear[key.split("|")[1]] ?? 0) + 1;
  console.log(`PRECIOS: en el archivo ${prices.length} filas | descartadas por datos inválidos ${junk} | ya existentes con costo distinto (no se tocan) ${differing} | nuevos ${newPrices.size} por año ${JSON.stringify(byYear)}`);
  const missingProductForPrice = [...newPrices.keys()].filter((key) => {
    const code = key.split("|")[0];
    return !haveProducts.has(code) && !newProducts.has(code);
  });
  console.log(`  precios nuevos cuyo producto no existe ni se carga: ${missingProductForPrice.length}`);

  if (dryRun) {
    console.log("Dry run: no se escribió nada.");
    return;
  }

  await excelPostgres.$transaction(
    async (tx) => {
      await tx.$executeRaw`LOCK TABLE base_productos IN SHARE ROW EXCLUSIVE MODE`;
      for (const [code, row] of newProducts) {
        await tx.excelProduct.create({
          data: {
            product: text(row["Producto"]),
            uniqueCode: code,
            active: true,
            supplierUniqueCode: text(row["Cód. Unico Prov."]) || null,
            brandOriginal: text(row["Marca"]) || null,
            supplierOriginal: text(row["Proveedor"]) || null,
            categoryOriginal: text(row["Categoría"]) || null,
            brandId: brandId.get(norm(row["Marca"])) ?? null,
            supplierId: supplierId.get(norm(row["Proveedor"])) ?? null,
            categoryId: categoryId.get(norm(row["Categoría"])) ?? null,
            packageSize: row["Bulto"] === "" ? null : num(row["Bulto"]),
            legacyId: `maestra-${code}`,
            sourceUpdatedAt: new Date(),
          },
        });
      }
      const supplierByCode = new Map<string, string>();
      for (const row of products) supplierByCode.set(norm(row["Código Único"]), text(row["Proveedor"]));
      const data = [...newPrices.entries()].map(([key, row]) => {
        const code = key.split("|")[0];
        return {
          supplier: text(row["DB_Producto.Proveedor"]) || supplierByCode.get(code) || null,
          uniqueCode: code,
          day: Number(row["Día"]) >= 1 && Number(row["Día"]) <= 31 ? Number(row["Día"]) : 1,
          month: Number(row["Mes"]),
          year: Number(row["Año"]),
          dgCost: round(num(row["Costo DG"]), 4),
          vat: percentFromMultiplier(row["IVA"]) ?? 21,
          publicPrice: round(num(row["Precio Publico"]), 4),
          markup: percentFromMultiplier(row["Mark Up"]),
          legacyId: `maestra-${key.replace(/\|/g, "-")}`,
        };
      });
      for (let offset = 0; offset < data.length; offset += 1000) {
        await tx.excelPrice.createMany({ data: data.slice(offset, offset + 1000) });
      }
    },
    { timeout: 900_000 },
  );
  console.log(`OK. Productos cargados: ${newProducts.size}. Precios cargados: ${newPrices.size}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
