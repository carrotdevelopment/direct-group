import "server-only";
import { excelPostgres } from "@/lib/excel-postgres-client";
import { invalidateIncomeGroups, readStockOperationRowsFromPostgres } from "@/lib/postgres-operation-db";
import { realStockForCode } from "@/lib/stock-operations";
import { checkMigration } from "@/lib/client-code-migration";

export class ClientCodeMigrationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const text = (value: unknown) => String(value ?? "").trim();
const normalize = (value: unknown) => text(value).toLowerCase();

async function stockOf(client: string, clientCode: string) {
  const { incomes, egresses } = await readStockOperationRowsFromPostgres(client);
  return realStockForCode(
    client,
    clientCode,
    incomes.map((row) => ({ clientCode: text(row["Código Cliente"]), operation: text(row["Operación"]), delivered: Number(row["Entregado"]) || 0 })),
    egresses.map((row) => ({ clientCode: text(row["SKU"]), operation: text(row["Operación"]), quantity: Number(row["Cantidad"]) || 0 })),
  );
}

// Valida la migración y calcula el stock actual de los dos códigos (misma cuenta que la pantalla Stock).
export async function previewClientCodeMigration(input: { client?: unknown; oldCode?: unknown; newCode?: unknown }) {
  const clients = await excelPostgres.excelClient.findMany({ select: { name: true, active: true } });
  const client = clients.find((item) => normalize(item.name) === normalize(input.client) && item.active !== false)?.name;
  if (!client) throw new ClientCodeMigrationError("Elegí un cliente activo.");
  const codes = await excelPostgres.excelClientCode.findMany({
    select: { client: true, clientCode: true, uniqueCode: true, active: true, voidedAt: true },
  });
  const check = checkMigration(
    codes.filter((code) => code.client && code.clientCode && code.uniqueCode).map((code) => ({
      client: String(code.client), clientCode: String(code.clientCode), uniqueCode: String(code.uniqueCode),
      active: code.active === true, voided: !!code.voidedAt,
    })),
    String(client),
    text(input.oldCode),
    text(input.newCode),
  );
  if (!check.ok) throw new ClientCodeMigrationError(check.error);
  const [oldStock, newStock, product] = await Promise.all([
    stockOf(check.client, check.oldCode),
    stockOf(check.client, check.newCode),
    excelPostgres.excelProduct.findFirst({ where: { uniqueCode: normalize(check.uniqueCode) }, select: { product: true } }),
  ]);
  return { ...check, product: product?.product ?? null, oldStock, newStock };
}

function currentPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return { year: Number(parts.find((part) => part.type === "year")?.value), month: Number(parts.find((part) => part.type === "month")?.value) };
}

// Pasa el stock del código viejo al nuevo (egreso en el viejo, ingreso en el nuevo), deja el viejo no
// vigente y el nuevo vigente (dándolo de alta si no existe) y registra la migración.
export async function executeClientCodeMigration(input: { client?: unknown; oldCode?: unknown; newCode?: unknown }, actor: string) {
  const plan = await previewClientCodeMigration(input);
  const quantity = plan.oldStock.stock;
  if (quantity < 0) {
    throw new ClientCodeMigrationError(`El código ${plan.oldCode} tiene stock negativo (${quantity}): revisalo antes de migrarlo.`);
  }
  const now = new Date();
  const comment = `Migración de código cliente ${plan.oldCode} → ${plan.newCode}`;
  const { year, month } = currentPeriod();

  const migration = await excelPostgres.$transaction(async (tx) => {
    if (quantity > 0) {
      await tx.egress.create({
        data: {
          client: plan.client, clientCode: plan.oldCode, uniqueCode: plan.uniqueCode, product: plan.product,
          operation: "PASAJE", quantity, date: now, destination: plan.client, comments: comment, createdBy: actor,
        },
      });
      await tx.tangoIncome.create({
        data: {
          client: plan.client, clientCode: plan.newCode, operation: "PASAJE", orderDate: now, deliveryDate: now,
          quantity, deliveredQuantity: quantity, transferOrigin: plan.client, comments: comment,
          // No viene de Tango: así la sincronización no lo toma como un ingreso pendiente de conciliar.
          pendingTangoEntry: true, createdBy: actor,
        },
      });
    }
    await tx.excelClientCode.updateMany({
      where: { client: { equals: plan.client, mode: "insensitive" }, clientCode: { equals: plan.oldCode, mode: "insensitive" }, voidedAt: null },
      data: { active: false },
    });
    if (plan.newExists) {
      await tx.excelClientCode.updateMany({
        where: { client: { equals: plan.client, mode: "insensitive" }, clientCode: { equals: plan.newCode, mode: "insensitive" }, voidedAt: null },
        data: { active: true },
      });
    } else {
      await tx.excelClientCode.create({
        data: { client: plan.client, clientCode: plan.newCode, uniqueCode: plan.uniqueCode, assignmentYear: year, assignmentMonth: month, active: true },
      });
    }
    return tx.clientCodeMigration.create({
      data: {
        client: plan.client, oldCode: plan.oldCode, newCode: plan.newCode, uniqueCode: plan.uniqueCode,
        product: plan.product, quantity, createdBy: actor,
      },
    });
  });
  if (quantity > 0) invalidateIncomeGroups();
  return { migration, quantity, newCodeCreated: !plan.newExists };
}

export function listClientCodeMigrations() {
  return excelPostgres.clientCodeMigration.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
}
