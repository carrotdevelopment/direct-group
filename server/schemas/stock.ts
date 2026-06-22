import { z } from "zod";

const quantity = z.number().positive().finite().max(999_999_999);

export const stockTransferSchema = z.object({
  productId: z.string().cuid(),
  originClientId: z.string().cuid(),
  destinationClientId: z.string().cuid(),
  warehouseId: z.string().cuid().optional(),
  quantity,
  comments: z.string().trim().min(5).max(500),
  allowNegativeStock: z.boolean().default(false),
}).refine((value) => value.originClientId !== value.destinationClientId, {
  message: "El cliente de origen y destino deben ser distintos",
  path: ["destinationClientId"],
});

export type StockTransferInput = z.infer<typeof stockTransferSchema>;
