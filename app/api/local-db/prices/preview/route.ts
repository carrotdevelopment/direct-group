import { NextResponse } from "next/server";
import { previewPriceImport } from "@/lib/price-importer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const supplier = String(formData.get("supplier") || "").trim();
  const month = Number(formData.get("month") || "0");
  const year = Number(formData.get("year") || "0");
  const file = formData.get("file");

  if (!supplier || !month || !year || !(file instanceof File)) {
    return NextResponse.json(
      {
        prices: [],
        message: "Proveedor, mes, año y archivo son obligatorios.",
        warnings: [],
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const preview = await previewPriceImport({
    supplier,
    month,
    year,
    fileName: file.name,
    buffer,
  });

  return NextResponse.json(preview);
}
