import "server-only";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { readStockOperationRowsFromPostgres } from "@/lib/postgres-operation-db";
import { realStockForCode } from "@/lib/stock-operations";

export type CodeStock = { real: number; reserved: number; available: number };

const text = (value: unknown) => String(value ?? "").trim();

// Stock que se puede pasar desde cada código de un cliente: el stock real (misma cuenta que la pantalla
// Stock) menos lo que ya está comprometido en pasajes pendientes o aprobados que todavía no se confirmaron.
export async function availableStockForCodes(client: string, codes: string[]) {
  const wanted = [...new Set(codes.map((code) => text(code)).filter(Boolean))];
  const result = new Map<string, CodeStock>();
  if (!text(client) || wanted.length === 0) return result;
  const [operations, pending] = await Promise.all([
    readStockOperationRowsFromPostgres(client),
    excelPostgres.pasajeRequest.groupBy({
      by: ["fromClientCode"],
      where: {
        fromClient: { equals: text(client), mode: "insensitive" },
        status: { in: ["pending", "approved"] },
        OR: wanted.map((code) => ({ fromClientCode: { equals: code, mode: "insensitive" as const } })),
      },
      _sum: { quantity: true },
    }),
  ]);
  const incomes = operations.incomes.map((row) => ({
    clientCode: text(row["Código Cliente"]),
    operation: text(row["Operación"]),
    delivered: Number(row["Entregado"]) || 0,
  }));
  const egresses = operations.egresses.map((row) => ({
    clientCode: text(row.SKU),
    operation: text(row["Operación"]),
    quantity: Number(row.Cantidad) || 0,
  }));
  const reservedByCode = new Map(pending.map((row) => [row.fromClientCode.toLowerCase(), Number(row._sum.quantity ?? 0)]));
  for (const code of wanted) {
    const { stock } = realStockForCode(client, code, incomes, egresses);
    const reserved = reservedByCode.get(code.toLowerCase()) ?? 0;
    result.set(code.toLowerCase(), { real: stock, reserved, available: stock - reserved });
  }
  return result;
}

export function stockShortageMessage(code: string, requested: number, stock: CodeStock) {
  if (requested <= stock.available) return null;
  const reserved = stock.reserved ? ` (stock real ${stock.real}, ${stock.reserved} ya comprometidos en otros pasajes)` : "";
  return `${code} tiene ${stock.available} disponibles${reserved} y se piden ${requested}.`;
}
