import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import {
  readProductsFromExcel,
  readPricesFromExcel,
  writePricesToExcel,
  type ExcelPrice,
} from "@/lib/local-excel-db";
import { usesPostgres } from "@/lib/data-source";
import {
  deletePricesFromPostgres,
  readProductsFromPostgres,
  readPricesFromPostgres,
  upsertPricesToPostgres,
} from "@/lib/postgres-replica-db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await checkApiAccess(["precios"], false);
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const prices = usesPostgres()
    ? await readPricesFromPostgres()
    : readPricesFromExcel();

  if (searchParams.get("meta") === "1") {
    const suppliers = Array.from(
      new Set(prices.map((price) => price.supplier).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right, "es"));
    const months = Array.from(
      new Set(
        prices.map((price) => price.informedAt.split("-")[1]).filter(Boolean),
      ),
    ).sort((left, right) => Number(left) - Number(right));
    const years = Array.from(
      new Set(
        prices.map((price) => price.informedAt.split("-")[0]).filter(Boolean),
      ),
    ).sort((left, right) => Number(right) - Number(left));

    return NextResponse.json({
      options: { suppliers, months, years },
      total: prices.length,
      source: usesPostgres() ? "postgresql" : "excel",
    });
  }

  const supplier = searchParams.get("supplier") || "all";
  const month = searchParams.get("month") || "all";
  const year = searchParams.get("year") || "all";
  const day = searchParams.get("day") || "all";
  const uniqueCode = searchParams.get("uniqueCode")?.trim().toLowerCase() || "";
  const filteredPrices = prices
    .filter((price) => {
      const matchesSupplier = supplier === "all" || price.supplier === supplier;
      const [priceYear, priceMonth, priceDay] = price.informedAt.split("-");
      const matchesMonth =
        month === "all" || priceMonth === month.padStart(2, "0");
      const matchesYear = year === "all" || priceYear === year;
      const matchesDay = day === "all" || priceDay === day.padStart(2, "0");
      const matchesCode =
        !uniqueCode || price.uniqueCode.trim().toLowerCase() === uniqueCode;
      return matchesSupplier && matchesMonth && matchesYear && matchesDay && matchesCode;
    })
    .sort((left, right) => right.informedAt.localeCompare(left.informedAt));

  return NextResponse.json({
    prices: filteredPrices.slice(0, 1000),
    total: filteredPrices.length,
    source: usesPostgres() ? "postgresql" : "excel",
  });
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export async function POST(request: Request) {
  const denied = await checkApiAccess(["precios"], true);
  if (denied) return denied;
  const body = (await request.json()) as {
    prices?: Array<Omit<ExcelPrice, "id" | "supplier">>;
  };
  const incoming = body.prices ?? [];
  if (!incoming.length) {
    return NextResponse.json(
      { message: "Ingresá al menos un precio." },
      { status: 400 },
    );
  }

  const [products, existing] = await Promise.all([
    usesPostgres()
      ? readProductsFromPostgres()
      : Promise.resolve(readProductsFromExcel()),
    usesPostgres()
      ? readPricesFromPostgres()
      : Promise.resolve(readPricesFromExcel()),
  ]);
  const productsByCode = new Map(
    products.map((product) => [product.code.trim().toLowerCase(), product]),
  );
  const existingKeys = new Set(
    existing.map(
      (price) =>
        `${price.uniqueCode.trim().toLowerCase()}::${price.informedAt}`,
    ),
  );
  const batchKeys = new Set<string>();
  const prices: ExcelPrice[] = [];

  for (const [index, price] of incoming.entries()) {
    const code = price.uniqueCode?.trim();
    const product = productsByCode.get(code?.toLowerCase() || "");
    if (!product) {
      return NextResponse.json(
        {
          message: `El código único '${code || `fila ${index + 1}`}' no existe en Productos.`,
        },
        { status: 400 },
      );
    }
    const date = new Date(`${price.informedAt}T00:00:00.000Z`);
    if (
      !price.informedAt ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== price.informedAt
    ) {
      return NextResponse.json(
        { message: `La fecha de '${code}' no es válida.` },
        { status: 400 },
      );
    }
    const values = [
      price.costDg,
      price.vatRate,
      price.publicPrice,
      price.markup,
    ];
    if (
      values.some(
        (value) => typeof value !== "number" || !Number.isFinite(value),
      )
    ) {
      return NextResponse.json(
        { message: `Faltan valores económicos válidos para '${code}'.` },
        { status: 400 },
      );
    }
    const key = `${code.toLowerCase()}::${price.informedAt}`;
    if (existingKeys.has(key) || batchKeys.has(key)) {
      const [year, month, day] = price.informedAt.split("-");
      return NextResponse.json(
        {
          message: `Ya hay un precio cargado para '${code}' el ${day}/${month}/${year}. Usá la opción de búsqueda para editarlo.`,
        },
        { status: 409 },
      );
    }
    batchKeys.add(key);
    prices.push({
      id: crypto.randomUUID(),
      supplier: product.supplier || "Sin proveedor",
      uniqueCode: code,
      informedAt: price.informedAt,
      costDg: round(price.costDg, 2),
      vatRate: round(price.vatRate, 3),
      publicPrice: round(price.publicPrice, 2),
      markup: round(price.markup, 2),
    });
  }

  if (usesPostgres()) await upsertPricesToPostgres(prices);
  else writePricesToExcel([...existing, ...prices]);

  return NextResponse.json({
    prices,
    message: `${prices.length} precio${prices.length === 1 ? "" : "s"} cargado${prices.length === 1 ? "" : "s"} correctamente.`,
  });
}

export async function PUT(request: Request) {
  const denied = await checkApiAccess(["precios"], true);
  if (denied) return denied;
  const body = (await request.json()) as { prices?: ExcelPrice[] };
  const prices = body.prices ?? [];
  if (usesPostgres()) {
    await upsertPricesToPostgres(prices);
    return NextResponse.json({ prices, source: "postgresql" });
  }
  const allPrices = readPricesFromExcel();
  const mergedById = new Map(allPrices.map((price) => [price.id, price]));

  for (const price of prices) {
    mergedById.set(price.id, price);
  }

  writePricesToExcel(Array.from(mergedById.values()));
  return NextResponse.json({ prices, source: "excel" });
}

export async function DELETE(request: Request) {
  const denied = await checkApiAccess(["precios"], true);
  if (denied) return denied;
  const body = (await request.json()) as { ids?: string[] };
  const ids = (body.ids ?? []).filter(Boolean);
  if (!ids.length) {
    return NextResponse.json(
      { message: "No se indicaron precios para eliminar." },
      { status: 400 },
    );
  }

  let deleted = 0;
  if (usesPostgres()) {
    deleted = await deletePricesFromPostgres(ids);
  } else {
    const existing = readPricesFromExcel();
    const idSet = new Set(ids);
    const next = existing.filter((price) => !idSet.has(price.id));
    deleted = existing.length - next.length;
    writePricesToExcel(next);
  }

  if (!deleted) {
    return NextResponse.json(
      { message: "No se encontró el precio." },
      { status: 404 },
    );
  }
  return NextResponse.json({
    message: `${deleted} precio${deleted === 1 ? "" : "s"} eliminado${deleted === 1 ? "" : "s"} correctamente.`,
  });
}
