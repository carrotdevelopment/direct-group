import { readStockOperationRowsFromPostgres } from "@/lib/postgres-operation-db";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { realStockForCode } from "@/lib/stock-operations";

// Uso: tsx --conditions=react-server scripts/migracion-completa/verificar-stock.ts
// Solo lee. Compara, código por código, el stock que calcula la plataforma contra el de las tablas mig_*
// (los Excel), con las mismas operaciones que usan las planillas.
type Target = { client: string; code: string; stock: number };
const key = (value: unknown) => String(value ?? "").trim().toLowerCase();

async function main() {
  const target = await excelPostgres.$queryRaw<Target[]>`
    WITH i AS (
      SELECT cl, lower(btrim(cod)) k, sum(ent) q FROM mig_ingresos
      WHERE op IN ('COMPRA', 'PASAJE', 'ROBO/AJUSTE', 'DEVOLUCION', 'DEVOLUCIÓN') GROUP BY 1, 2
    ), e AS (
      SELECT cl, lower(btrim(cod)) k, sum(q) q FROM mig_egresos
      WHERE op IN ('CANJE', 'ROBO_AJUSTE', 'PASAJE', 'CAMBIO') OR (op = 'REENVIO' AND cl IN ('Credicoop', 'Umiles')) GROUP BY 1, 2
    )
    SELECT coalesce(i.cl, e.cl) AS client, coalesce(i.k, e.k) AS code, (coalesce(i.q, 0) - coalesce(e.q, 0))::float8 AS stock
    FROM i FULL JOIN e USING (cl, k)`;
  for (const client of [...new Set(target.map((row) => row.client))].sort()) {
    const operations = await readStockOperationRowsFromPostgres(client);
    const incomes = new Map<string, Array<{ clientCode: string; operation: string; delivered: number }>>();
    const egresses = new Map<string, Array<{ clientCode: string; operation: string; quantity: number }>>();
    for (const row of operations.incomes) {
      const code = key(row["Código Cliente"]);
      const list = incomes.get(code) ?? [];
      list.push({ clientCode: code, operation: String(row["Operación"]), delivered: Number(row["Entregado"]) || 0 });
      incomes.set(code, list);
    }
    for (const row of operations.egresses) {
      const code = key(row.SKU);
      const list = egresses.get(code) ?? [];
      list.push({ clientCode: code, operation: String(row["Operación"]), quantity: Number(row.Cantidad) || 0 });
      egresses.set(code, list);
    }
    const rows = target.filter((row) => row.client === client);
    let equal = 0;
    let expected = 0;
    let actual = 0;
    const wrong: string[] = [];
    for (const row of rows) {
      const { stock } = realStockForCode(client, row.code, incomes.get(row.code) ?? [], egresses.get(row.code) ?? []);
      expected += row.stock;
      actual += stock;
      if (Math.abs(stock - row.stock) < 0.001) equal += 1;
      else wrong.push(`${row.code}: Excel ${row.stock}, plataforma ${stock}`);
    }
    console.log(`${client}: ${equal} de ${rows.length} códigos iguales | Excel ${expected} | plataforma ${actual}`);
    if (wrong.length) console.log(`  ${wrong.slice(0, 25).join("; ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
