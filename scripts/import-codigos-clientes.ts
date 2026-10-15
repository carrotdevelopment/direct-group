import * as XLSX from "xlsx";
import fs from "node:fs";
import { excelPostgres } from "@/lib/excel-postgres-client-core";

// Uso: tsx scripts/import-codigos-clientes.ts "<DB_Clientes 1.csv | .xlsm>" [--clientes=Amex,Credicoop] [--vigente-desde=AAAAMM] [--dry-run]
// Carga en Códigos cliente las asignaciones de la hoja DB_Clientes 1 (una fila por mes) para los
// clientes que existen en Clientes. Cada par código cliente + código único entra una vez, con el
// primer mes en que aparece; queda vigente si figura en el último período de su cliente en el
// archivo (con --vigente-desde, solo si ese período no es anterior). No toca lo que ya existe.
// Después completa el código único de los egresos de cada cliente.
const filePath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const arg = (name: string) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];
const onlyClients = arg("clientes")?.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
const activeFrom = Number(arg("vigente-desde") ?? "0");
if (!filePath) {
  console.error('Uso: tsx scripts/import-codigos-clientes.ts "<archivo>" [--clientes=A,B] [--vigente-desde=AAAAMM] [--dry-run]');
  process.exit(1);
}

// Nombres del archivo que en Clientes son otro cliente.
const ALIASES: Record<string, string> = {
  "credicoop regular": "credicoop",
  "credicoop especiales": "credicoop",
};

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();
const text = (value: unknown) => String(value ?? "").trim();

function readRows() {
  const raw = fs.readFileSync(filePath);
  const workbook = filePath.toLowerCase().endsWith(".csv")
    ? XLSX.read(raw.toString("utf8").replace(/^﻿/, ""), { type: "string", raw: true })
    : XLSX.read(raw, { type: "buffer" });
  const sheet = workbook.Sheets["DB_Clientes 1"] ?? (filePath.toLowerCase().endsWith(".csv") ? workbook.Sheets[workbook.SheetNames[0]] : undefined);
  if (!sheet) throw new Error('No encontré la hoja "DB_Clientes 1".');
  return XLSX.utils
    .sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
    .filter((row) => Number(row["Año"]) >= 2020 && Number(row["Año"]) <= 2030 && Number(row["Mes"]) >= 1 && Number(row["Mes"]) <= 12);
}

async function main() {
  const rows = readRows();
  const clients = await excelPostgres.excelClient.findMany({ select: { name: true } });
  const clientByKey = new Map(clients.map((client) => [norm(client.name), text(client.name)]));
  const period = (row: Record<string, unknown>) => Number(row["Año"]) * 100 + Number(row["Mes"]);

  // Un cliente puede venir de varios nombres del archivo (Credicoop regular y especiales): cada
  // par es vigente según el último período de su propio nombre.
  type Pair = { clientCode: string; uniqueCode: string; first: number; last: number; source: string };
  const latestBySource = new Map<string, number>();
  for (const row of rows) latestBySource.set(norm(row["Cliente"]), Math.max(latestBySource.get(norm(row["Cliente"])) ?? 0, period(row)));
  const isActive = (pair: Pair) => {
    const latest = latestBySource.get(pair.source) ?? 0;
    return pair.last === latest && latest >= activeFrom;
  };
  const byClient = new Map<string, { pairs: Map<string, Pair>; sources: Set<string> }>();
  const unknown = new Map<string, number>();
  for (const row of rows) {
    const source = norm(row["Cliente"]);
    const target = clientByKey.get(ALIASES[source] ?? source);
    if (!target) {
      unknown.set(source, (unknown.get(source) ?? 0) + 1);
      continue;
    }
    if (onlyClients && !onlyClients.includes(norm(target))) continue;
    const clientCode = text(row["Código Cliente"]);
    const uniqueCode = norm(row["Código Único"]);
    if (!clientCode || !uniqueCode) continue;
    const group = byClient.get(target) ?? { pairs: new Map(), sources: new Set() };
    group.sources.add(source);
    const key = `${norm(clientCode)}|${uniqueCode}`;
    const pair = group.pairs.get(key) ?? { clientCode, uniqueCode, first: period(row), last: period(row), source };
    pair.first = Math.min(pair.first, period(row));
    if (period(row) >= pair.last) {
      pair.last = period(row);
      pair.source = source;
    }
    group.pairs.set(key, pair);
    byClient.set(target, group);
  }
  if (unknown.size) console.log("Clientes del archivo que no existen en Clientes (no se cargan):", Object.fromEntries(unknown));

  const plan: Array<{ client: string; fresh: Pair[] }> = [];
  for (const [client, group] of [...byClient.entries()].sort()) {
    const existing = await excelPostgres.excelClientCode.findMany({
      where: { client: { equals: client, mode: "insensitive" } },
      select: { clientCode: true, uniqueCode: true, active: true, voidedAt: true },
    });
    const have = new Set(existing.map((item) => `${norm(item.clientCode)}|${norm(item.uniqueCode)}`));
    const fresh = [...group.pairs.entries()].filter(([key]) => !have.has(key)).map(([, pair]) => pair);
    const activeCount = fresh.filter(isActive).length;
    const staleActive = existing.filter((item) => {
      const pair = group.pairs.get(`${norm(item.clientCode)}|${norm(item.uniqueCode)}`);
      return item.active && !item.voidedAt && (!pair || !isActive(pair));
    }).length;
    console.log(
      `${client} (${[...group.sources].map((source) => `${source} ${latestBySource.get(source)}`).join(" + ")}): ` +
      `Pares ${group.pairs.size}, ya existían ${group.pairs.size - fresh.length}, a cargar ${fresh.length} (vigentes ${activeCount}). ` +
      `En la base: ${existing.length} (vigentes que no están en el último período del archivo: ${staleActive}).`,
    );
    plan.push({ client, fresh });
  }

  if (dryRun) {
    console.log("Dry run: no se escribió nada.");
    return;
  }

  for (const { client, fresh } of plan) {
    await excelPostgres.$transaction(async (tx) => {
      if (fresh.length) {
        await tx.excelClientCode.createMany({
          data: fresh.map((pair) => ({
            client,
            uniqueCode: pair.uniqueCode,
            clientCode: pair.clientCode,
            assignmentYear: Math.floor(pair.first / 100),
            assignmentMonth: pair.first % 100,
            active: isActive(pair),
          })),
        });
      }
      // Código único y producto de los egresos del cliente que no lo tienen: se toma la asignación
      // vigente del código (o, si ya no está vigente, la más reciente).
      const updated = await tx.$executeRaw`
        WITH best AS (
          SELECT DISTINCT ON (lower(btrim(codigo_cliente))) lower(btrim(codigo_cliente)) AS k, lower(btrim(codigo_unico)) AS sku
          FROM base_codigo_cliente
          WHERE lower(cliente) = lower(${client}) AND coalesce(btrim(codigo_unico), '') <> ''
          ORDER BY lower(btrim(codigo_cliente)), activo DESC NULLS LAST, anio_asignacion DESC NULLS LAST, mes_asignacion DESC NULLS LAST, id DESC
        )
        UPDATE egresos e
        SET codigo_unico = best.sku,
            producto = CASE WHEN coalesce(btrim(e.producto), '') = '' THEN p.producto ELSE e.producto END,
            updated_at = now()
        FROM best
        LEFT JOIN base_productos p ON lower(btrim(p.codigo_unico)) = best.sku
        WHERE lower(e.cliente) = lower(${client}) AND e.deleted_at IS NULL
          AND coalesce(btrim(e.codigo_unico), '') = ''
          AND lower(btrim(e.codigo_cliente)) = best.k`;
      console.log(`${client}: códigos cargados ${fresh.length}, egresos completados con código único ${updated}.`);
    }, { timeout: 600_000 });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
