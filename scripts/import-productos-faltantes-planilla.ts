import * as XLSX from "xlsx";
import fs from "node:fs";
import { excelPostgres } from "@/lib/excel-postgres-client-core";

// Uso: tsx scripts/import-productos-faltantes-planilla.ts "<4- Stock Umiles.xlsm>" [--dry-run]
// Crea en Productos los códigos únicos que aparecen en la hoja IngresosUmiles (con nombre, proveedor
// y categoría) y todavía no existen. No modifica productos existentes. La marca se toma de la
// segunda palabra del nombre si coincide con una marca ya cargada (si no, queda vacía).
const filePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!filePath) {
  console.error('Uso: tsx scripts/import-productos-faltantes-planilla.ts "<archivo.xlsm>" [--dry-run]');
  process.exit(1);
}
const text = (value: unknown) => String(value ?? "").trim();
const norm = (value: unknown) => text(value).toLowerCase();

async function main() {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets["IngresosUmiles"], { header: 1, defval: "", raw: true });
  const headerIndex = matrix.findIndex((row) => text(row[0]) === "Cliente");
  if (headerIndex < 0) throw new Error("No encontré el encabezado de IngresosUmiles.");
  const [existing, brands, suppliers, categories] = await Promise.all([
    excelPostgres.excelProduct.findMany({ select: { uniqueCode: true } }),
    excelPostgres.excelBrand.findMany(),
    excelPostgres.excelSupplier.findMany(),
    excelPostgres.excelCategory.findMany(),
  ]);
  const have = new Set(existing.map((row) => norm(row.uniqueCode)));
  const brandByName = new Map(brands.map((row) => [norm(row.name), row]));
  const supplierByName = new Map(suppliers.map((row) => [norm(row.supplier), row.id]));
  const categoryByName = new Map(categories.map((row) => [norm(row.category), row.id]));

  const fresh = new Map<string, { name: string; supplier: string; category: string; brand: string }>();
  for (const row of matrix.slice(headerIndex + 1)) {
    const code = norm(row[15]);
    const name = text(row[16]);
    if (!code || !name || have.has(code) || fresh.has(code)) continue;
    const words = name.split(/\s+/);
    const brand = words.slice(1, 3).find((word) => brandByName.has(norm(word))) ?? "";
    fresh.set(code, { name, supplier: text(row[17]), category: text(row[18]), brand });
  }
  console.log(`Productos que faltan: ${fresh.size}`);
  for (const [code, item] of fresh) {
    console.log(`  ${code} | ${item.name} | ${item.supplier || "(sin proveedor)"} | ${item.category || "(sin categoría)"} | marca: ${item.brand || "(vacía)"} | proveedor existe: ${supplierByName.has(norm(item.supplier))} | categoría existe: ${categoryByName.has(norm(item.category))}`);
  }
  if (dryRun || fresh.size === 0) {
    console.log(dryRun ? "Dry run: no se escribió nada." : "No hay productos para crear.");
    return;
  }
  await excelPostgres.$transaction(async (tx) => {
    await tx.$executeRaw`LOCK TABLE base_productos IN SHARE ROW EXCLUSIVE MODE`;
    for (const [code, item] of fresh) {
      await tx.excelProduct.create({
        data: {
          product: item.name,
          uniqueCode: code,
          active: true,
          supplierUniqueCode: code,
          brandOriginal: item.brand || null,
          supplierOriginal: item.supplier || null,
          categoryOriginal: item.category || null,
          brandId: item.brand ? (brandByName.get(norm(item.brand))?.id ?? null) : null,
          supplierId: supplierByName.get(norm(item.supplier)) ?? null,
          categoryId: categoryByName.get(norm(item.category)) ?? null,
          packageSize: 1,
          legacyId: `planilla-${code}`,
          sourceUpdatedAt: new Date(),
        },
      });
    }
  });
  console.log(`OK. ${fresh.size} productos creados.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
