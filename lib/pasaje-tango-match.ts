import { stockIncomeOperations } from "@/lib/stock-operations";

// Un pasaje de la plataforma también se carga en Tango: ingreso y fila de Tango son el mismo movimiento
// y tienen que contarse una sola vez. Se reconocen por código cliente, cantidad y fecha cercana. No se
// usa el cliente que manda Tango porque es el depósito (por ejemplo URBANO EXPRESS).
export const TANGO_DAYS_BEFORE_PASAJE = 7;
export const TANGO_DAYS_AFTER_CONFIRMATION = 30;

const DAY_MS = 86_400_000;
const normalize = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();

export function tangoWindowStart(pasajeDate: Date) {
  return new Date(pasajeDate.getTime() - TANGO_DAYS_BEFORE_PASAJE * DAY_MS);
}

// Operaciones de Tango que pueden ser este pasaje. Solo las que suman stock en el cliente: en Umiles los
// pasajes entran como ajustes, pero en otro cliente un ajuste no cuenta y vincularlo borraría el ingreso.
export function tangoPasajeOperations(client: string) {
  return [...stockIncomeOperations(client)].filter((operation) => operation === "PASAJE" || operation.startsWith("AJUSTE "));
}

export type IncomingTangoRow = { externalKey: string; operation: string; clientCode: string; delivered: number; deliveryDate: Date };
export type ConfirmedPasajeIncome<Id> = { id: Id; client: string; clientCode: string; delivered: number; orderDate: Date; deliveryDate: Date };

// Empareja de a uno los ingresos de pasajes ya confirmados con las filas nuevas de Tango, los más viejos
// primero: dos pasajes iguales necesitan dos filas de Tango.
export function matchPasajeIncomes<Id>(incomes: ConfirmedPasajeIncome<Id>[], incoming: IncomingTangoRow[]) {
  const available = [...incoming].sort((a, b) => a.deliveryDate.getTime() - b.deliveryDate.getTime() || a.externalKey.localeCompare(b.externalKey));
  const ordered = [...incomes].sort((a, b) => a.deliveryDate.getTime() - b.deliveryDate.getTime());
  const matches: { id: Id; externalKey: string }[] = [];
  for (const income of ordered) {
    const operations = tangoPasajeOperations(income.client);
    const from = tangoWindowStart(income.orderDate).getTime();
    const to = income.deliveryDate.getTime() + TANGO_DAYS_AFTER_CONFIRMATION * DAY_MS;
    const index = available.findIndex((row) =>
      operations.includes(row.operation) &&
      normalize(row.clientCode) === normalize(income.clientCode) &&
      row.delivered === income.delivered &&
      row.deliveryDate.getTime() >= from && row.deliveryDate.getTime() <= to);
    if (index < 0) continue;
    matches.push({ id: income.id, externalKey: available[index].externalKey });
    available.splice(index, 1);
  }
  return matches;
}
