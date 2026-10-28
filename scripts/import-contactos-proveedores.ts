import * as XLSX from "xlsx";
import fs from "node:fs";
import { excelPostgres } from "@/lib/excel-postgres-client-core";

// Uso: tsx scripts/import-contactos-proveedores.ts "<Proveedores.xlsx>" [--dry-run]
// Carga los contactos a los que se les pide la lista de precios el primer día hábil de cada mes
// (Precios > Correo a proveedores). Columnas: PROVEEDOR, Mail, Contacto. El proveedor tiene que existir
// en Proveedores (se toma el nombre de ahí); un contacto con el mismo proveedor y correo no se repite.
const filePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!filePath) {
  console.error('Uso: tsx scripts/import-contactos-proveedores.ts "<Proveedores.xlsx>" [--dry-run]');
  process.exit(1);
}

const key = (value: unknown) =>
  String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const clean = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
// Los correos vienen a veces con espacios o entre <>: " <jfebre@silfab.com.ar>".
const cleanEmail = (value: unknown) => clean(value).replace(/^<|>$/g, "").trim().toLowerCase();
const cleanName = (value: unknown) => clean(value).replace(/['"]+$/g, "").replace(/,$/, "").trim();

async function main() {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "" });
  const headerIndex = matrix.findIndex((row) => row.some((cell) => key(cell) === "PROVEEDOR"));
  if (headerIndex < 0) throw new Error('No encontré la columna "PROVEEDOR".');
  const headers = matrix[headerIndex].map(key);
  const column = (name: string) => headers.indexOf(name);
  const [supplierCol, emailCol, contactCol] = [column("PROVEEDOR"), column("MAIL"), column("CONTACTO")];
  if (emailCol < 0) throw new Error('No encontré la columna "Mail".');

  const [suppliers, existing] = await Promise.all([
    excelPostgres.excelSupplier.findMany({ select: { supplier: true, active: true } }),
    excelPostgres.supplierMailContact.findMany({ select: { supplier: true, email: true } }),
  ]);
  const supplierByKey = new Map(suppliers.filter((s) => s.supplier).map((s) => [key(s.supplier), s]));
  const have = new Set(existing.map((c) => `${key(c.supplier)}|${c.email.trim().toLowerCase()}`));

  const toCreate: { supplier: string; contactName: string; email: string }[] = [];
  const problems: string[] = [];
  let repeated = 0;
  matrix.slice(headerIndex + 1).forEach((row, index) => {
    const line = headerIndex + index + 2;
    const rawSupplier = clean(row[supplierCol]);
    if (!rawSupplier) return;
    const supplier = supplierByKey.get(key(rawSupplier));
    const email = cleanEmail(row[emailCol]);
    if (!supplier?.supplier) return problems.push(`Fila ${line}: el proveedor "${rawSupplier}" no está en Proveedores.`);
    if (supplier.active === false) problems.push(`Fila ${line}: el proveedor ${supplier.supplier} está inactivo (se carga igual).`);
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return problems.push(`Fila ${line}: el correo "${clean(row[emailCol])}" no es válido.`);
    const id = `${key(supplier.supplier)}|${email}`;
    if (have.has(id)) {
      repeated += 1;
      return;
    }
    have.add(id);
    toCreate.push({ supplier: supplier.supplier, contactName: contactCol >= 0 ? cleanName(row[contactCol]) : "", email });
  });

  console.log(`Contactos nuevos: ${toCreate.length}. Ya estaban: ${repeated}. Con problemas: ${problems.length}.`);
  for (const problem of problems) console.log(`  ${problem}`);
  for (const contact of toCreate) console.log(`  + ${contact.supplier} · ${contact.contactName || "(sin nombre)"} · ${contact.email}`);
  if (dryRun || toCreate.length === 0) return console.log(dryRun ? "Dry run: no se escribió nada." : "No hay contactos nuevos.");
  await excelPostgres.supplierMailContact.createMany({ data: toCreate.map((contact) => ({ ...contact, active: true })) });
  console.log(`OK. ${toCreate.length} contactos cargados.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
