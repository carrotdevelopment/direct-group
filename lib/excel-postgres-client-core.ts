import { PrismaClient } from "../node_modules/.prisma/excel-client";

const globalForExcelPostgres = globalThis as unknown as {
  excelPostgres?: PrismaClient;
};

export const excelPostgres =
  globalForExcelPostgres.excelPostgres ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForExcelPostgres.excelPostgres = excelPostgres;
}
