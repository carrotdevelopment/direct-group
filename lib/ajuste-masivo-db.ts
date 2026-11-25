import "server-only";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { availableStockForCodes } from "@/lib/pasaje-stock-db";
import { invalidateIncomeGroups } from "@/lib/postgres-operation-db";
import { ADJUSTMENT_OPERATION } from "@/lib/tango-manual-entry";
import { MAX_AJUSTES, parseAjusteQuantity, type AjusteMode, type AjustePreviewRow } from "@/lib/ajuste-masivo";

export class AjusteError extends Error {}

const text = (value: unknown) => String(value ?? "").trim();

// Valida las filas y calcula cómo queda el stock de cada código. Si un código se repite, cada fila parte de
// lo que dejó la anterior.
export async function previewAjustes(clientInput: unknown, rowsInput: unknown, mode: AjusteMode) {
  const client = text(clientInput);
  if (!client) throw new AjusteError("Elegí el cliente.");
  if (!Array.isArray(rowsInput) || rowsInput.length === 0) throw new AjusteError("No hay filas para ajustar.");
  if (rowsInput.length > MAX_AJUSTES) throw new AjusteError(`Son ${rowsInput.length} filas: cargá hasta ${MAX_AJUSTES} por vez.`);

  const input = rowsInput.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    return {
      row: Number(item.row) || 0,
      clientCode: text(item.clientCode),
      quantity: parseAjusteQuantity(item.quantity),
      rawQuantity: text(item.quantity),
      reason: text(item.reason),
    };
  });
  const codes = await excelPostgres.excelClientCode.findMany({
    where: { client: { equals: client, mode: "insensitive" }, active: true, voidedAt: null },
    select: { client: true, clientCode: true, uniqueCode: true },
    orderBy: [{ assignmentYear: "asc" }, { assignmentMonth: "asc" }],
  });
  const mappings = new Map(codes.map((code) => [text(code.clientCode).toLowerCase(), code]));
  const found = input.flatMap((item) => mappings.get(item.clientCode.toLowerCase()) ?? []);
  const uniqueCodes = [...new Set(found.map((code) => text(code.uniqueCode)).filter(Boolean))];
  const [products, stocks] = await Promise.all([
    excelPostgres.excelProduct.findMany({ where: { uniqueCode: { in: uniqueCodes, mode: "insensitive" } }, select: { uniqueCode: true, product: true } }),
    availableStockForCodes(client, found.map((code) => text(code.clientCode))),
  ]);
  const names = new Map(products.map((product) => [text(product.uniqueCode).toLowerCase(), text(product.product)]));
  const running = new Map<string, number>();

  const rows: AjustePreviewRow[] = input.map((item) => {
    const key = item.clientCode.toLowerCase();
    const mapping = mappings.get(key);
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!item.clientCode) errors.push("Falta el código.");
    else if (!mapping) errors.push(`${client} no tiene activo el código ${item.clientCode}.`);
    if (item.quantity === null) errors.push(item.rawQuantity ? `La cantidad "${item.rawQuantity}" no es un número entero.` : "Falta la cantidad.");
    else if (item.quantity <= 0) errors.push(mode === "suma" ? "Acá solo se suma stock: para restar, usá Ajustes masivos de Egresos." : "La cantidad va sin signo: acá siempre resta stock.");
    if (!item.reason) errors.push("Falta el motivo.");
    const uniqueCode = text(mapping?.uniqueCode);
    const quantity = item.quantity ?? 0;
    let stock: number | null = null;
    let result: number | null = null;
    if (mapping) {
      if (running.has(key)) warnings.push("El código está repetido.");
      stock = running.get(key) ?? stocks.get(key)?.real ?? 0;
      if (errors.length === 0) {
        result = stock + quantity * (mode === "suma" ? 1 : -1);
        running.set(key, result);
        if (mode === "resta" && result < 0) warnings.push("Queda en negativo.");
      }
    }
    return {
      row: item.row,
      clientCode: mapping ? text(mapping.clientCode) : item.clientCode,
      uniqueCode,
      product: names.get(uniqueCode.toLowerCase()) ?? "",
      quantity,
      reason: item.reason,
      stock,
      result,
      errors,
      warnings,
    };
  });
  return { client: text(codes[0]?.client) || client, rows };
}

// Carga todos los ajustes juntos, como ingresos si suman stock o como egresos si restan: si una fila tiene un error no se carga ninguna.
export async function createAjustes(clientInput: unknown, rowsInput: unknown, mode: AjusteMode, createdBy: string) {
  const { client, rows } = await previewAjustes(clientInput, rowsInput, mode);
  const bad = rows.filter((row) => row.errors.length > 0).length;
  if (bad > 0) throw new AjusteError(`Filas con errores: ${bad}. Corregilas y volvé a revisar. No se cargó ningún ajuste.`);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
  const date = new Date(`${day}T00:00:00.000Z`);
  if (mode === "resta") {
    const { count } = await excelPostgres.egress.createMany({
      data: rows.map((row) => ({
        operation: ADJUSTMENT_OPERATION,
        client,
        clientCode: row.clientCode,
        uniqueCode: row.uniqueCode,
        product: row.product.slice(0, 255),
        date,
        quantity: row.quantity,
        comments: `Ajuste de stock: ${row.reason}`.slice(0, 4000),
        createdBy,
      })),
    });
    return { created: count };
  }
  const { count } = await excelPostgres.tangoIncome.createMany({
    data: rows.map((row) => ({
      operation: ADJUSTMENT_OPERATION,
      client,
      clientCode: row.clientCode,
      quantity: row.quantity,
      deliveredQuantity: row.quantity,
      deliveryDate: date,
      comments: `Ajuste de stock: ${row.reason}`.slice(0, 4000),
      pendingTangoEntry: true,
      createdBy,
    })),
  });
  invalidateIncomeGroups();
  return { created: count };
}
