import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import {
  readClientsFromExcel,
  readClientRatesFromExcel,
  writeClientsToExcel,
  writeClientRatesToExcel,
  type ExcelClient,
  type ExcelClientRateItem,
} from "@/lib/local-excel-db";
import { normalizeForDuplicateCheck } from "@/lib/normalize";
import { usesPostgres } from "@/lib/data-source";
import {
  readClientsFromPostgres,
  readClientRatesFromPostgres,
  writeClientsToPostgres,
  writeClientRatesToPostgres,
} from "@/lib/postgres-replica-db";

export const runtime = "nodejs";

export async function GET() {
  const denied = await checkApiAccess(["clientes"], false);
  if (denied) return denied;
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
    return { ...client, configs };
  });

  return NextResponse.json({
    clients: result,
    source: usesPostgres() ? "postgresql" : "excel",
  });
}

export async function PUT(request: Request) {
  const denied = await checkApiAccess(["clientes"], true);
  if (denied) return denied;
  const body = (await request.json()) as {
    clients?: ExcelClient[];
    rates?: ExcelClientRateItem[];
  };

  if (body.clients) {
    const seen = new Map<string, string>();
    for (const client of body.clients) {
      const key = normalizeForDuplicateCheck(client.name);
      if (!key) continue;
      if (seen.has(key)) {
        return NextResponse.json(
          { ok: false, message: `Ya existe un cliente con el nombre "${seen.get(key)}".` },
          { status: 409 },
        );
      }
      seen.set(key, client.name.trim());
    }
    if (usesPostgres()) await writeClientsToPostgres(body.clients);
    else writeClientsToExcel(body.clients);
  }

  if (body.rates) {
    if (usesPostgres()) await writeClientRatesToPostgres(body.rates);
    else writeClientRatesToExcel(body.rates);
  }

  return NextResponse.json({
    ok: true,
    source: usesPostgres() ? "postgresql" : "excel",
  });
}
