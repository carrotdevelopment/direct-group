import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { inspectLocalDataFolder } from "@/lib/local-data-health";
import { usesPostgres } from "@/lib/data-source";
import { excelPostgres } from "@/lib/excel-postgres-client";

export const runtime = "nodejs";

export async function GET() {
  const denied = await checkApiAccess(["admin"], false);
  if (denied) return denied;
  try {
    if (usesPostgres()) {
      const [products, clients, suppliers, categories] = await Promise.all([
        excelPostgres.excelProduct.count(),
        excelPostgres.excelClient.count(),
        excelPostgres.excelSupplier.count(),
        excelPostgres.excelCategory.count(),
      ]);
      return NextResponse.json({
        ok: true,
        source: "postgresql",
        database: "dg_platform_excel",
        counts: { products, clients, suppliers, categories },
      });
    }
    const health = inspectLocalDataFolder();
    return NextResponse.json(
      { ...health, source: "excel" },
      { status: health.ok ? 200 : 424 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo inspeccionar la carpeta de bases locales.";
    return NextResponse.json(
      {
        ok: false,
        message,
      },
      { status: 500 },
    );
  }
}
