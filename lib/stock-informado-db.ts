import "server-only";
import { excelPostgres } from "@/lib/excel-postgres-client";
import type { SavedInformado } from "@/lib/stock-informado";

type Row = { code: string; quantity: number | null; overIncome: boolean; updatedBy: string; updatedAt: Date };

const toMap = (rows: Row[]) =>
  new Map<string, SavedInformado>(rows.map(({ code, updatedAt, ...row }) => [code, { ...row, updatedAt: updatedAt.toISOString() }]));

// Informado por código de cliente, en minúsculas.
export async function readInformado(client: string) {
  return toMap(await excelPostgres.$queryRaw<Row[]>`
    select codigo_cliente as code, cantidad::float8 as quantity, sobre_ingreso as "overIncome", updated_by as "updatedBy", updated_at as "updatedAt"
    from stock_informado where cliente = ${client.trim().toLowerCase()}`);
}

// Guarda los códigos que existen en el cliente, como número fijo, y devuelve cómo quedaron.
export async function saveInformado(client: string, values: { code: string; quantity: number | null }[], user: string) {
  const name = client.trim().toLowerCase();
  const byCode = new Map(values.map((item) => [item.code.trim().toLowerCase(), item.quantity]));
  const wanted = JSON.stringify([...byCode].map(([code, quantity]) => ({ code, quantity })));
  return toMap(await excelPostgres.$queryRaw<Row[]>`
    insert into stock_informado (cliente, codigo_cliente, cantidad, sobre_ingreso, updated_by, updated_at)
    select ${name}::text, v.code, v.quantity, false, ${user}::text, now()
    from jsonb_to_recordset(${wanted}::jsonb) as v(code text, quantity numeric)
    where exists (select 1 from base_codigo_cliente b where lower(trim(b.cliente)) = ${name} and lower(trim(b.codigo_cliente)) = v.code)
    on conflict (cliente, codigo_cliente) do update
      set cantidad = excluded.cantidad, sobre_ingreso = false, updated_by = excluded.updated_by, updated_at = now()
    returning codigo_cliente as code, cantidad::float8 as quantity, sobre_ingreso as "overIncome", updated_by as "updatedBy", updated_at as "updatedAt"`);
}
