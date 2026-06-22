import { z } from "zod";

export const createProductSchema = z.object({
  name: z.string().trim().min(3).max(160),
  internalCode: z.string().trim().regex(/^DG-\d{6}$/, "Formato esperado: DG-000000"),
  description: z.string().trim().max(500).optional(),
  brandId: z.string().cuid().optional(),
  categoryId: z.string().cuid().optional(),
  primarySupplierId: z.string().cuid().optional(),
  unitsPerPackage: z.number().int().positive().max(100_000).optional(),
  supplierCode: z.string().trim().max(80).optional(),
});

export const productListSchema = z.object({
  query: z.string().trim().max(100).default(""),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(10).max(100).default(25),
});
