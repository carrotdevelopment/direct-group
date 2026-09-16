import { z } from "zod";

export const TANGO_MAX_ROWS = 20000;
export const TANGO_BATCH_SIZE = 200;
export const tangoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    && value >= "1900-01-01" && value <= "2099-12-31";
}, "Fecha inválida.");
export const tangoRange = z.object({ from: tangoDate, to: tangoDate }).refine(
  ({ from, to }) => to >= from && (Date.parse(to) - Date.parse(from)) / 86400000 < 93,
  "Elegí un período de hasta 93 días, con Desde anterior o igual a Hasta.",
);
const field = z.string().trim().max(255);
// Decimal strings preserve the precision of SQL Server quantities in transit.
const quantity = z.string().regex(/^-?\d{1,14}(\.\d{1,4})?$/);
export const tangoRow = z.object({
  sourceId: z.string().regex(/^[1-9]\d{0,18}$/),
  headerId: z.string().regex(/^[1-9]\d{0,18}$/),
  client: field,
  operation: z.enum(["COMPRA", "ENTRADA", "DEVOLUCION", "CANCELACION DE CANJE", "PASAJE",
    "AJUSTE NO VALORIZADO", "AJUSTE VALORIZADO", "ANOMALOS", "NOTA DE CREDITO", "OTRO"]),
  orderDate: tangoDate.nullable(),
  purchaseOrder: field,
  clientCode: field,
  quantity,
  deliveryDate: tangoDate,
  deliveredQuantity: quantity,
  comments: z.string().trim().max(16000),
});
export const agentRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("claim") }),
  z.object({ action: z.literal("batch"), jobId: z.uuid(), claimToken: z.uuid(),
    index: z.number().int().min(0).max(TANGO_MAX_ROWS / TANGO_BATCH_SIZE - 1),
    rows: z.array(tangoRow).min(1).max(TANGO_BATCH_SIZE) }),
  z.object({ action: z.literal("finish"), jobId: z.uuid(), claimToken: z.uuid(),
    totalRows: z.number().int().min(0).max(TANGO_MAX_ROWS),
    totalBatches: z.number().int().min(0).max(TANGO_MAX_ROWS / TANGO_BATCH_SIZE) }),
  z.object({ action: z.literal("fail"), jobId: z.uuid(), claimToken: z.uuid(),
    code: z.enum(["SQL_CONNECTION", "SQL_QUERY", "TOO_MANY_ROWS", "INVALID_RESULT", "TRANSFER_FAILED"]) }),
]);
export type TangoAgentRequest = z.infer<typeof agentRequest>;
export type TangoRow = z.infer<typeof tangoRow>;
