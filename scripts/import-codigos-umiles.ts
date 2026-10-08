import * as XLSX from "xlsx";
import fs from "node:fs";
import { excelPostgres } from "@/lib/excel-postgres-client-core";

// Uso: tsx scripts/import-codigos-umiles.ts "<1 - Consulta Base de datos.xlsm>" [--dry-run]
// Carga en Códigos cliente las asignaciones de Umiles de la hoja DB_Clientes 1 (una fila por mes
// en el archivo): cada par código cliente + código único entra una vez, con el primer mes en que
// aparece, y queda vigente solo si figura en el último período. No toca lo que ya existe.
// Después completa el código único y el producto de los egresos de Umiles que quedaron sin ellos.
const filePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!filePath) {
  console.error('Uso: tsx scripts/import-codigos-umiles.ts "<archivo.xlsm>" [--dry-run]');
  process.exit(1);
}

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();
const text = (value: unknown) => String(value ?? "").trim();

async function main() {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer" });
  const sheet = workbook.Sheets["DB_Clientes 1"];
  if (!sheet) throw new Error('No encontré la hoja "DB_Clientes 1".');
  const rows = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
    .filter((row) => norm(row["Cliente"]) === "umiles" && Number(row["Año"]) >= 2020 && Number(row["Año"]) <= 2030);
  const period = (row: Record<string, unknown>) => Number(row["Año"]) * 100 + Number(row["Mes"]);
  const latest = Math.max(...rows.map(period));

  type Pair = { clientCode: string; uniqueCode: string; first: number; last: number };
  const pairs = new Map<string, Pair>();
  for (const row of rows) {
    const clientCode = text(row["Código Cliente"]);
    const uniqueCode = norm(row["Código Único"]);
    if (!clientCode || !uniqueCode) continue;
    const key = `${norm(clientCode)}|${uniqueCode}`;
    const current = pairs.get(key) ?? { clientCode, uniqueCode, first: period(row), last: period(row) };
    current.first = Math.min(current.first, period(row));
    current.last = Math.max(current.last, period(row));
    pairs.set(key, current);
  }

  const existing = await excelPostgres.excelClientCode.findMany({
    where: { client: { equals: "Umiles", mode: "insensitive" } },
    select: { clientCode: true, uniqueCode: true },
  });
  const have = new Set(existing.map((item) => `${norm(item.clientCode)}|${norm(item.uniqueCode)}`));

  const fresh = [...pairs.entries()].filter(([key]) => !have.has(key)).map(([, pair]) => pair);
  const active = fresh.filter((pair) => pair.last === latest);
  console.log(`Último período del archivo: ${latest}. Pares código+SKU: ${pairs.size}. Ya existían: ${pairs.size - fresh.length}. A cargar: ${fresh.length} (vigentes ${active.length}, históricos ${fresh.length - active.length}).`);

  if (dryRun) {
    const [{ count }] = await excelPostgres.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM egresos e
      WHERE lower(e.cliente) = 'umiles' AND e.deleted_at IS NULL AND coalesce(btrim(e.codigo_unico), '') = ''`;
    console.log(`Egresos de Umiles sin código único hoy: ${count}. Dry run: no se escribió nada.`);
    return;
  }

  await excelPostgres.$transaction(async (tx) => {
    await tx.excelClientCode.createMany({
      data: fresh.map((pair) => ({
        client: "Umiles",
        uniqueCode: pair.uniqueCode,
        clientCode: pair.clientCode,
        assignmentYear: Math.floor(pair.first / 100),
        assignmentMonth: pair.first % 100,
        active: pair.last === latest,
      })),
    });
    // Código único y producto de los egresos de Umiles: se toma la asignación vigente del código
    // (o, si ya no está vigente, la más reciente).
    const updated = await tx.$executeRaw`
      WITH best AS (
        SELECT DISTINCT ON (lower(btrim(codigo_cliente))) lower(btrim(codigo_cliente)) AS k, lower(btrim(codigo_unico)) AS sku
        FROM base_codigo_cliente
        WHERE lower(cliente) = 'umiles' AND coalesce(btrim(codigo_unico), '') <> ''
        ORDER BY lower(btrim(codigo_cliente)), activo DESC NULLS LAST, anio_asignacion DESC NULLS LAST, mes_asignacion DESC NULLS LAST, id DESC
      )
      UPDATE egresos e
      SET codigo_unico = best.sku,
          producto = CASE WHEN coalesce(btrim(e.producto), '') = '' THEN p.producto ELSE e.producto END,
          updated_at = now()
      FROM best
      LEFT JOIN base_productos p ON lower(btrim(p.codigo_unico)) = best.sku
      WHERE lower(e.cliente) = 'umiles' AND e.deleted_at IS NULL
        AND coalesce(btrim(e.codigo_unico), '') = ''
        AND lower(btrim(e.codigo_cliente)) = best.k`;
    console.log(`Egresos de Umiles completados con código único: ${updated}.`);
  });
  const [{ count: remaining }] = await excelPostgres.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM egresos e
    WHERE lower(e.cliente) = 'umiles' AND e.deleted_at IS NULL AND coalesce(btrim(e.codigo_unico), '') = ''`;
  console.log(`Egresos de Umiles que siguen sin código único: ${remaining}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
