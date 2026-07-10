import { NextResponse } from "next/server";
import {
  appendIncomeRows,
  deleteIncomeRow,
  getOperationsSummary,
  incomeSchema,
  readIncomeRows,
  updateIncomeRow,
} from "@/lib/operation-excel-db";

export const runtime = "nodejs";

export function GET(request: Request) {
  const url = new URL(request.url);
  const client = url.searchParams.get("client") || undefined;
  const month = Number(url.searchParams.get("month") || "0") || undefined;
  const year = Number(url.searchParams.get("year") || "0") || undefined;
  const summaryOnly = url.searchParams.get("summaryOnly") === "1";
  return NextResponse.json({
    schema: incomeSchema,
    summary: getOperationsSummary().income,
    rows: summaryOnly ? [] : readIncomeRows({ client, month, year }),
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, message: "Tenés que adjuntar un archivo Excel." },
      { status: 400 },
    );
  }

  const result = appendIncomeRows(Buffer.from(await file.arrayBuffer()));
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message, receivedHeaders: result.receivedHeaders },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ...result,
    message: `${result.insertedRows} ingresos cargados. Total acumulado: ${result.totalRows}.`,
  });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    rowIndex?: number;
    quantity?: string;
    delivered?: string;
  };
  if (typeof body.rowIndex !== "number") {
    return NextResponse.json(
      { ok: false, message: "Fila inválida." },
      { status: 400 },
    );
  }
  const ok = updateIncomeRow(body.rowIndex, {
    quantity: body.quantity,
    delivered: body.delivered,
  });
  if (!ok) {
    return NextResponse.json(
      { ok: false, message: "No encontré esa fila." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, message: "Ingreso actualizado." });
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const rowIndex = Number(url.searchParams.get("rowIndex"));
  if (!Number.isInteger(rowIndex)) {
    return NextResponse.json(
      { ok: false, message: "Fila inválida." },
      { status: 400 },
    );
  }
  const ok = deleteIncomeRow(rowIndex);
  if (!ok) {
    return NextResponse.json(
      { ok: false, message: "No encontré esa fila." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, message: "Ingreso eliminado." });
}
