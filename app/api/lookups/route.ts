import { NextResponse } from "next/server";
import { checkApiAccess } from "@/server/lib/access";
import { usesPostgres } from "@/lib/data-source";
import { readProductsFromExcel, readSuppliersFromExcel, readClientsFromExcel, readClientRatesFromExcel, readClientCodesFromExcel, type ExcelClientRateItem } from "@/lib/local-excel-db";
import { readProductsFromPostgres, readSuppliersFromPostgres, readClientsFromPostgres, readClientRatesFromPostgres, readClientCodesFromPostgres } from "@/lib/postgres-replica-db";

// Read-only supporting data. This does not grant access to the entity management APIs.
export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind") ?? "";
  const allowed: Record<string, string[]> = { products: ["precios", "clientes"], suppliers: ["productos"], clients: ["precios"], "client-codes": ["ventas"] };
  const denied = await checkApiAccess(allowed[kind] ?? ["admin"]);
  if (denied) return denied;
  if (kind === "products") {
    const all = usesPostgres() ? await readProductsFromPostgres() : readProductsFromExcel();
    return NextResponse.json({ products: all.filter(product => product.active) });
  }
  if (kind === "suppliers") {
    const all = usesPostgres() ? await readSuppliersFromPostgres() : readSuppliersFromExcel();
    return NextResponse.json({ suppliers: all.map(({ id, name, active }) => ({ id, name, active })) });
  }
  if (kind === "client-codes") {
    const all = usesPostgres() ? await readClientCodesFromPostgres() : readClientCodesFromExcel();
    return NextResponse.json({ mappings: all.map(({ client, clientCode, active }) => ({ client, clientCode, active })) });
  }
  if (kind !== "clients") return NextResponse.json({ message: "Consulta desconocida." }, { status: 400 });
  const [clients, rates] = usesPostgres()
    ? await Promise.all([
        readClientsFromPostgres(),
        readClientRatesFromPostgres(),
      ])
    : [readClientsFromExcel(), readClientRatesFromExcel()];

  // Group rates by clientId + effectiveFrom, sorted newest first
  const ratesByClient: Record<string, ExcelClientRateItem[]> = {};
  for (const item of rates) {
    const key = item.clientId;
    ratesByClient[key] = ratesByClient[key] ?? [];
    ratesByClient[key].push(item);
  }

  const result = clients.map((client) => {
    const allItems = (ratesByClient[client.id] ?? []).sort((a, b) =>
      b.effectiveFrom.localeCompare(a.effectiveFrom),
    );
    // Unique periods for this client, newest first
    const periods = Array.from(new Set(allItems.map((r) => r.effectiveFrom)));
    const configs = periods.map((period) => ({
      effectiveFrom: period,
      items: allItems
        .filter((r) => r.effectiveFrom === period)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }));
    return { id: client.id, name: client.name, active: client.active, configs };
  });

  return NextResponse.json({
    clients: result,
    source: usesPostgres() ? "postgresql" : "excel",
  });
}
