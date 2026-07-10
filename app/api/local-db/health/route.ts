import { NextResponse } from "next/server";
import { inspectLocalDataFolder } from "@/lib/local-data-health";

export const runtime = "nodejs";

export function GET() {
  try {
    const health = inspectLocalDataFolder();
    return NextResponse.json(health, { status: health.ok ? 200 : 424 });
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
