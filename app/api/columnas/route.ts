import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { excelPostgres } from "@/lib/excel-postgres-client";

export const runtime = "nodejs";

// Columnas elegidas por cada usuario en una vista (Egresos, Stock): orden y cuáles se ven. Se guardan
// en la tabla configuracion, una fila por usuario y vista, para que sigan igual en cualquier computadora.
const VIEW = /^[\p{L}\p{N} :_-]{1,60}$/u;

async function settingKey(view: string) {
  const user = (await auth())?.user;
  const who = (user?.email || user?.name || "").trim().toLowerCase();
  if (!who || !VIEW.test(view)) return null;
  return `columnas:${view}:${who}`.slice(0, 100);
}

export async function GET(request: Request) {
  const key = await settingKey(new URL(request.url).searchParams.get("view") ?? "");
  if (!key) return NextResponse.json({ message: "Vista inválida o sesión vencida." }, { status: 400 });
  const row = await excelPostgres.configSetting.findUnique({ where: { key } });
  const columns = Array.isArray(row?.value) ? (row.value as unknown[]).filter((item): item is string => typeof item === "string") : null;
  return NextResponse.json({ columns });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as { view?: unknown; columns?: unknown } | null;
  const key = await settingKey(String(body?.view ?? ""));
  const columns = body?.columns;
  if (!key || !Array.isArray(columns) || columns.length > 300 || !columns.every((item) => typeof item === "string" && item.length <= 200)) {
    return NextResponse.json({ message: "Columnas inválidas." }, { status: 400 });
  }
  const user = (await auth())?.user;
  await excelPostgres.configSetting.upsert({
    where: { key },
    create: { key, value: columns, updatedBy: user?.email || user?.name || null },
    update: { value: columns, updatedBy: user?.email || user?.name || null },
  });
  return NextResponse.json({ ok: true });
}
