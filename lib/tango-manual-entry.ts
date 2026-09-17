import "server-only";

import { z } from "zod";
import { excelPostgres } from "@/lib/excel-postgres-client";

// Operaciones que un usuario puede cargar manualmente mientras no exista una
// vía oficial de escritura hacia Tango (ver docs/ADR-002-TANGO-INGRESOS-INTEGRATION.md).
// Quedan marcadas como pendientes hasta que alguien las carga también en Tango.
export const manualTangoOperations = [
  "DEVOLUCION",
  "PASAJE",
  "AJUSTE NO VALORIZADO",
  "AJUSTE VALORIZADO",
] as const;

export const manualTangoIncomeSchema = z.object({
  operation: z.enum(manualTangoOperations),
  client: z.string().trim().min(1).max(255),
  clientCode: z.string().trim().min(1).max(255),
  quantity: z.number().positive().max(999999999),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  transferOrigin: z.string().trim().max(255).optional(),
  comments: z.string().trim().max(4000).optional(),
});

export type ManualTangoIncomeInput = z.infer<typeof manualTangoIncomeSchema>;

export async function createManualTangoIncome(input: ManualTangoIncomeInput, createdBy: string) {
  return excelPostgres.tangoIncome.create({
    data: {
      operation: input.operation,
      client: input.client,
      clientCode: input.clientCode,
      quantity: input.quantity,
      deliveredQuantity: input.quantity,
      deliveryDate: new Date(`${input.deliveryDate}T00:00:00.000Z`),
      transferOrigin: input.operation === "PASAJE" ? (input.transferOrigin || null) : null,
      comments: input.comments || null,
      pendingTangoEntry: true,
      createdBy,
    },
  });
}
