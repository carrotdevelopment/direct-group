import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateUploadedFile } from "@/lib/upload-validation";

export const runtime = "nodejs";

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
const uploadDir = () =>
  path.join(/* turbopackIgnore: true */ process.cwd(), "storage", "uploads", "products");

export async function POST(request: Request) {
  const denied = await checkApiAccess(["productos"], true);
  if (denied) return denied;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, message: "Falta el archivo de imagen." }, { status: 400 });
  }

  const validation = validateUploadedFile(file, {
    allowedExtensions: ALLOWED_EXTENSIONS,
    label: "La imagen",
  });
  if (!validation.ok) {
    return NextResponse.json({ ok: false, message: validation.message }, { status: 400 });
  }

  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "jpg";
  const filename = `${randomUUID()}.${extension}`;
  const dir = uploadDir();
  await mkdir(dir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(dir, filename), buffer);

  return NextResponse.json({ ok: true, url: `/api/uploads/products/${filename}` });
}
