import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { readProductsFromPostgres } from "@/lib/postgres-replica-db";
import {
  buildProductProposalWorkbook,
  proposalFileName,
  sortProposalRows,
  type ProposalImage,
  type ProposalRow,
} from "@/lib/product-proposal-excel";

export const runtime = "nodejs";

type ProposalItem = { uniqueCode?: string; clientCode?: string; product?: string; category?: string; price?: number };

const MAX_ITEMS = 300;
const IMAGE_MAX_PX = 600;

function normalizeCode(value: string) {
  return value.trim().toLowerCase();
}

async function readImageSource(url: string): Promise<Buffer | null> {
  const local = url.match(/^\/api\/uploads\/products\/([a-f0-9-]+\.[a-z0-9]+)$/i);
  if (local) {
    const filePath = path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "storage",
      "uploads",
      "products",
      local[1],
    );
    return readFile(filePath).catch(() => null);
  }
  if (/^https?:\/\//i.test(url)) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch {
      return null;
    }
  }
  return null;
}

// Excel solo acepta PNG/JPEG: se reduce y convierte para que el archivo no pese de más.
async function loadImage(url: string | undefined): Promise<ProposalImage | null> {
  if (!url?.trim()) return null;
  const source = await readImageSource(url.trim());
  if (!source) return null;
  try {
    const { data, info } = await sharp(source)
      .rotate()
      .resize(IMAGE_MAX_PX, IMAGE_MAX_PX, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, extension: "jpeg", width: info.width, height: info.height };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const denied = await checkApiAccess(["precios"], false);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as {
    client?: string;
    title?: string;
    validity?: string;
    items?: ProposalItem[];
  } | null;
  const client = body?.client?.trim() ?? "";
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!client) {
    return NextResponse.json({ ok: false, message: "Falta el cliente." }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ ok: false, message: "Seleccioná al menos un producto." }, { status: 400 });
  }
  if (items.length > MAX_ITEMS) {
    return NextResponse.json(
      { ok: false, message: `La propuesta admite hasta ${MAX_ITEMS} productos.` },
      { status: 400 },
    );
  }

  const products = await readProductsFromPostgres();
  const byCode = new Map(products.map((product) => [normalizeCode(product.code), product]));

  const rows: ProposalRow[] = await Promise.all(
    items.map(async (item) => {
      const product = byCode.get(normalizeCode(item.uniqueCode ?? ""));
      return {
        clientCode: item.clientCode?.trim() ?? "",
        category: product?.category || item.category?.trim() || "",
        product: item.product?.trim() || product?.name || "",
        model: product?.supplierCode || "",
        brand: product?.brand || "",
        price: Number.isFinite(Number(item.price)) ? Number(item.price) : 0,
        description: product?.description?.trim() || "",
        image: await loadImage(product?.imageUrl),
      };
    }),
  );

  const title = body?.title?.trim() ?? "";
  const buffer = await buildProductProposalWorkbook({
    client,
    title,
    validity: body?.validity?.trim() ?? "",
    rows: sortProposalRows(rows),
  });
  const fileName = proposalFileName(client, title);
  const missingImages = rows.filter((row) => !row.image).length;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="propuesta.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "X-Missing-Images": String(missingImages),
      "Cache-Control": "no-store",
    },
  });
}
