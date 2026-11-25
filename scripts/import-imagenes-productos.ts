/**
 * Asocia las fotos de local-data/imagenes-productos a los productos por código único.
 * Solo coincidencias exactas (nombre del archivo o de la subcarpeta). No pisa fotos ya cargadas.
 * Lo dudoso y lo que no coincide queda en un Excel para revisar.
 *
 *   npx tsx scripts/import-imagenes-productos.ts            (simula y arma el Excel)
 *   npx tsx scripts/import-imagenes-productos.ts --apply    (escribe)
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import * as XLSX from "xlsx";
import { excelPostgres as db } from "../lib/excel-postgres-client-core";

const apply = process.argv.includes("--apply");
const base = path.join(process.cwd(), "local-data", "imagenes-productos");
const uploads = path.join(process.cwd(), "storage", "uploads", "products");
const report = path.join(process.cwd(), "local-data", "imagenes-a-revisar.xlsx");

const exact = (value: string) => value.normalize("NFC").trim().toLowerCase();
const loose = (value: string) => exact(value).replace(/[^a-z0-9ñ]/g, "");
const withoutSuffix = (value: string) => value.replace(/\s*(\(\d+\)|[-_ ]\d{1,2})\s*$/, "");
const isShortNumber = (value: string) => /^\d{1,3}$/.test(value);

// Revisadas a ojo el 25/11/2026: el código coincide, pero la foto es de otro producto o no sirve.
const REJECTED = new Set(["80230", "9413", "9532", "jja70564b101", "pe-lma327b"]);
// Foto elegida a mano cuando la primera de la carpeta no muestra el producto.
const PREFERRED: Record<string, string> = { "pe-cp120r": "111.jpg" };

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(jpe?g|png|webp|gif|avif)$/i.test(entry.name) ? [full] : [];
  });
}

async function main() {
  const target = new URL(process.env.EXCEL_DATABASE_URL ?? "");
  console.log(`Base: ${target.hostname}:${target.port}${target.pathname} · ${apply ? "ESCRIBE" : "simulación"}`);

  const products = (
    await db.excelProduct.findMany({ select: { id: true, uniqueCode: true, product: true, imageUrl: true } })
  ).filter((row) => row.uniqueCode?.trim());
  type Product = (typeof products)[number];
  const byExact = new Map<string, Product>();
  const byLoose = new Map<string, Product[]>();
  for (const row of products) {
    byExact.set(exact(row.uniqueCode!), row);
    const key = loose(row.uniqueCode!);
    if (key) byLoose.set(key, [...(byLoose.get(key) ?? []), row]);
  }

  const candidates = new Map<bigint, { product: Product; files: Array<{ file: string; rank: number }> }>();
  const review: Array<Record<string, string>> = [];
  const note = (file: string, reason: string, found: Product[] = []) =>
    review.push({
      Archivo: path.relative(base, file),
      Motivo: reason,
      "Código posible": found.map((row) => row.uniqueCode).join(" / "),
      "Producto posible": found.map((row) => row.product).join(" / "),
      "Código correcto (completar)": "",
    });

  for (const file of walk(base)) {
    const name = path.parse(file).name;
    const folder = path.basename(path.dirname(file));
    const byFile = byExact.get(exact(name));
    const byFolder = byExact.get(exact(folder));
    const fileIsCode = byFile && !isShortNumber(exact(name));

    if (byFolder && fileIsCode && byFile.id !== byFolder.id) {
      note(file, "El archivo y la carpeta son códigos distintos", [byFile, byFolder]);
      continue;
    }
    const product = byFolder ?? byFile;
    if (product) {
      const code = byFolder ? folder : name;
      if (isShortNumber(exact(code))) { note(file, "Nombre de número corto: puede ser casualidad", [product]); continue; }
      if (REJECTED.has(exact(code))) { note(file, "Revisada: la foto no muestra el producto", [product]); continue; }
      const similar = byLoose.get(loose(code)) ?? [];
      if (similar.length > 1) { note(file, "Hay códigos casi iguales", similar); continue; }
      const entry = candidates.get(product.id) ?? { product, files: [] };
      // Primero el archivo con el nombre del código; si no, el número más bajo de la carpeta.
      const number = name.match(/(\d+)\s*\)?\s*$/)?.[1];
      entry.files.push({ file, rank: PREFERRED[exact(code)] === exact(path.basename(file)) ? -2 : byFile?.id === product.id ? -1 : Number(number ?? 0) });
      candidates.set(product.id, entry);
      continue;
    }
    const near = byLoose.get(loose(folder)) ?? byLoose.get(loose(name)) ?? byLoose.get(loose(withoutSuffix(name)));
    note(file, near ? "Código parecido, no igual" : "No coincide con ningún producto", near);
  }

  let linked = 0;
  let already = 0;
  for (const { product, files } of candidates.values()) {
    if (product.imageUrl?.trim()) { already += 1; continue; }
    files.sort((a, b) => a.rank - b.rank || a.file.localeCompare(b.file, "es", { numeric: true }));
    let data: Buffer;
    try {
      data = await sharp(files[0].file)
        .rotate()
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch (error) {
      note(files[0].file, `No se pudo leer la imagen: ${(error as Error).message}`, [product]);
      continue;
    }
    if (apply) {
      const filename = `${randomUUID()}.jpg`;
      fs.mkdirSync(uploads, { recursive: true });
      fs.writeFileSync(path.join(uploads, filename), data);
      const updated = await db.excelProduct.updateMany({
        where: { id: product.id, OR: [{ imageUrl: null }, { imageUrl: "" }] },
        data: { imageUrl: `/api/uploads/products/${filename}` },
      });
      if (updated.count === 0) { fs.unlinkSync(path.join(uploads, filename)); already += 1; continue; }
    }
    linked += 1;
  }

  review.sort((a, b) => a.Motivo.localeCompare(b.Motivo) || a.Archivo.localeCompare(b.Archivo));
  const sheet = XLSX.utils.json_to_sheet(review);
  sheet["!cols"] = [60, 46, 28, 50, 28].map((wch) => ({ wch }));
  if (sheet["!ref"]) sheet["!autofilter"] = { ref: sheet["!ref"] };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "A revisar");
  fs.writeFileSync(report, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer);

  const reasons: Record<string, number> = {};
  for (const row of review) reasons[row.Motivo] = (reasons[row.Motivo] ?? 0) + 1;
  console.log({ asociados: linked, yaTenianFoto: already, aRevisar: review.length, motivos: reasons });
}

main().finally(() => db.$disconnect());
