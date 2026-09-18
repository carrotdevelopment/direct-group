import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const denied = await checkApiAccess(["productos"], false);
  if (denied) return denied;

  const { filename } = await params;
  if (!/^[a-f0-9-]+\.[a-z0-9]+$/i.test(filename)) {
    return NextResponse.json({ ok: false, message: "Nombre de archivo inválido." }, { status: 400 });
  }

  const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) {
    return NextResponse.json({ ok: false, message: "Tipo de archivo no soportado." }, { status: 400 });
  }

  try {
    const filePath = path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "storage",
      "uploads",
      "products",
      filename,
    );
    const buffer = await readFile(filePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Imagen no encontrada." }, { status: 404 });
  }
}
