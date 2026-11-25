import { NextResponse } from "next/server";
import { checkApiAccess } from "@/server/lib/access";
import { readPricesFromExcel, readProductsFromExcel, writePricesToExcel, type ExcelPrice } from "@/lib/local-excel-db";
import { usesPostgres } from "@/lib/data-source";
import { readPricesFromPostgres, readProductsFromPostgres, upsertPricesToPostgres } from "@/lib/postgres-replica-db";
import { calculateMarkup } from "@/lib/price-importer";

export const runtime = "nodejs";

const fail = (message: string) => NextResponse.json({ message }, { status: 400 });
const round = (value: number, decimals: number) => Math.round((value + Number.EPSILON) * 10 ** decimals) / 10 ** decimals;
const keyOf = (code: string, informedAt: string) => `${code.trim().toLowerCase()}::${informedAt}`;

// Guarda la lista de un proveedor ya revisada. Un producto tiene un solo precio por fecha:
// si ya estaba cargado, se reemplaza (volver a subir la misma lista no duplica).
export async function POST(request: Request) {
  const denied = await checkApiAccess(["precios"], true);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { prices?: Array<Partial<ExcelPrice>> } | null;
  const incoming = Array.isArray(body?.prices) ? body.prices : [];
  if (!incoming.length) return fail("No hay precios para cargar.");

  const products = usesPostgres() ? await readProductsFromPostgres() : readProductsFromExcel();
  const byCode = new Map(products.map((product) => [product.code.trim().toLowerCase(), product]));
  const seen = new Set<string>();
  const prices: ExcelPrice[] = [];
  for (const price of incoming) {
    const code = String(price?.uniqueCode ?? "").trim();
    const product = byCode.get(code.toLowerCase());
    if (!product) return fail(`El código único '${code}' no existe en Productos.`);
    const informedAt = String(price.informedAt ?? "");
    const date = new Date(`${informedAt}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== informedAt) {
      return fail(`La fecha de '${code}' no es válida.`);
    }
    const { costDg, vatRate, publicPrice } = price;
    const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
    // Algunas listas (Alpaca) no informan precio público: se aceptan en 0.
    if (!valid(costDg) || !valid(vatRate) || !valid(publicPrice) || (!costDg && !publicPrice)) {
      return fail(`Faltan valores válidos para '${code}'.`);
    }
    const key = keyOf(product.code, informedAt);
    if (seen.has(key)) return fail(`'${code}' está dos veces en la carga.`);
    seen.add(key);
    prices.push({
      id: crypto.randomUUID(),
      supplier: product.supplier || "Sin proveedor",
      uniqueCode: product.code,
      informedAt,
      costDg: round(costDg, 2),
      vatRate: round(vatRate, 3),
      publicPrice: round(publicPrice, 2),
      markup: calculateMarkup(costDg, vatRate, publicPrice),
    });
  }

  const stored = usesPostgres() ? await readPricesFromPostgres(prices.map((price) => price.uniqueCode)) : readPricesFromExcel();
  const storedIds = new Map(stored.map((price) => [keyOf(price.uniqueCode, price.informedAt), price.id]));
  let replaced = 0;
  for (const price of prices) {
    const id = storedIds.get(keyOf(price.uniqueCode, price.informedAt));
    if (!id) continue;
    price.id = id;
    replaced += 1;
  }
  if (usesPostgres()) {
    await upsertPricesToPostgres(prices);
  } else {
    writePricesToExcel([...new Map([...stored, ...prices].map((price) => [price.id, price])).values()]);
  }

  const created = prices.length - replaced;
  const parts = [
    created ? `${created} ${created === 1 ? "precio cargado" : "precios cargados"}` : "",
    replaced ? `${replaced} ${replaced === 1 ? "precio reemplazado" : "precios reemplazados"}` : "",
  ].filter(Boolean);
  return NextResponse.json({ prices, message: `${parts.join(" y ")}.` });
}
