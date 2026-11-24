import "server-only";
import { excelPostgres } from "@/lib/excel-postgres-client";
import type { CodeType } from "@/lib/code-type";

// Tipo por código de cliente, en minúsculas.
export async function readCodeTypes(client: string) {
  const rows = await excelPostgres.$queryRaw<{ code: string; type: CodeType }[]>`
    select codigo_cliente as code, tipo as type from base_codigo_tipo where cliente = ${client}`;
  return new Map(rows.map((row) => [row.code, row.type]));
}

// Guarda el tipo de los códigos que existen en el cliente y devuelve cuáles guardó.
export async function saveCodeTypes(client: string, codes: string[], type: CodeType, user: string) {
  const wanted = [...new Set(codes.map((code) => code.trim().toLowerCase()).filter(Boolean))];
  if (!wanted.length) return [];
  const rows = await excelPostgres.$queryRaw<{ code: string }[]>`
    insert into base_codigo_tipo (cliente, codigo_cliente, tipo, updated_by, updated_at)
    select distinct ${client}::text, lower(trim(codigo_cliente)), ${type}::text, ${user}::text, now() from base_codigo_cliente
    where lower(trim(cliente)) = ${client.toLowerCase()} and lower(trim(codigo_cliente)) = any(${wanted}::text[])
    on conflict (cliente, codigo_cliente) do update set tipo = excluded.tipo, updated_by = excluded.updated_by, updated_at = now()
    returning codigo_cliente as code`;
  return rows.map((row) => row.code);
}
