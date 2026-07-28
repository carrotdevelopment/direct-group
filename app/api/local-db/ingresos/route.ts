import { NextResponse } from "next/server";
import {
  getTangoIncomeOptions,
  getTangoIncomeSummary,
  incomeSchema,
  readTangoIncomeRows,
} from "@/lib/operation-excel-db";

export const runtime = "nodejs";

export function GET(request: Request) {
  const url = new URL(request.url);
  const clients = url.searchParams.getAll("client").filter(Boolean);
  const operation = url.searchParams.get("operation") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const months = url.searchParams
    .getAll("month")
    .map(Number)
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12);
  const years = url.searchParams
    .getAll("year")
    .map(Number)
    .filter((year) => Number.isInteger(year) && year > 2000);
  const limit = Number(url.searchParams.get("limit") || "750") || 750;
  const metaOnly = url.searchParams.get("metaOnly") === "1";
  const result = readTangoIncomeRows({
    clients,
    operation,
    status,
    months,
    years,
    search,
    limit,
  });
  return NextResponse.json({
    schema: incomeSchema,
    summary: getTangoIncomeSummary(),
    options: getTangoIncomeOptions(),
    rows: metaOnly ? [] : result.rows,
    totalFiltered: result.totalFiltered,
    viewSummary: result.viewSummary,
  });
}

export function POST() {
  return NextResponse.json(
    {
      ok: false,
      message:
        "Ingresos es una vista de solo lectura de Tango. Las cargas se hacen en Tango Gestión.",
    },
    { status: 405 },
  );
}

export function PATCH() {
  return NextResponse.json(
    {
      ok: false,
      message:
        "Ingresos es una vista de solo lectura de Tango. Las correcciones se hacen en Tango Gestión.",
    },
    { status: 405 },
  );
}

export function DELETE() {
  return NextResponse.json(
    {
      ok: false,
      message:
        "Ingresos es una vista de solo lectura de Tango. Las anulaciones se hacen en Tango Gestión.",
    },
    { status: 405 },
  );
}
