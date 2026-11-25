import { NextResponse } from "next/server";
import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { pendingPriceLists, resolvePriceLists } from "@/lib/supplier-lists";
import { previewPriceLists, summarizePreview } from "@/lib/price-list-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Listas recibidas por correo sin resolver, agrupadas por proveedor y mes, con el resumen de lo que cambiaría.
export async function GET() {
  const denied = await checkApiAccess(["precios"], false);
  if (denied) return denied;
  const groups = new Map<string, Awaited<ReturnType<typeof pendingPriceLists>>>();
  for (const list of await pendingPriceLists()) {
    const key = `${list.supplier}|${list.period}`;
    groups.set(key, [...(groups.get(key) ?? []), list]);
  }
  const result = [];
  for (const lists of groups.values()) {
    const { supplier, period } = lists[0];
    const [year, month] = period.split("-").map(Number);
    // Un archivo dañado no tapa a los demás: se muestra sin resumen y se puede descartar.
    const summary = await previewPriceLists(
      lists.filter((list) => list.content).map((list) => ({ supplier, fileName: list.fileName, content: list.content! })), month, year,
    ).then(summarizePreview).catch(() => null);
    result.push({
      supplier, period, summary,
      files: lists.map((list) => ({ id: list.id, name: list.fileName, sender: list.sender, receivedAt: list.receivedAt })),
    });
  }
  return NextResponse.json({ groups: result });
}

// Vista previa de las listas elegidas para el mes indicado.
export async function POST(request: Request) {
  const denied = await checkApiAccess(["precios"], false);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { ids?: unknown; month?: unknown; year?: unknown } | null;
  const ids = new Set(Array.isArray(body?.ids) ? body.ids.map(String) : []);
  const month = Number(body?.month);
  const year = Number(body?.year);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ message: "Elegí mes y año." }, { status: 400 });
  }
  const lists = (await pendingPriceLists()).filter((list) => ids.has(list.id) && list.content);
  if (!lists.length || lists.length !== ids.size) {
    return NextResponse.json({ message: "Esas listas ya se cargaron o se descartaron." }, { status: 409 });
  }
  try {
    return NextResponse.json(await previewPriceLists(lists.map((list) => ({ supplier: list.supplier, fileName: list.fileName, content: list.content! })), month, year));
  } catch {
    return NextResponse.json({ message: "No pude leer alguno de los archivos recibidos." }, { status: 422 });
  }
}

export async function DELETE(request: Request) {
  const denied = await checkApiAccess(["precios"], true);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter((id) => /^[0-9a-f-]{36}$/i.test(id)) : [];
  if (!ids.length) return NextResponse.json({ message: "No se indicaron listas." }, { status: 400 });
  const count = await resolvePriceLists(ids, "descartada", (await currentPasajeActor()).name);
  return NextResponse.json({ message: count === 1 ? "Lista descartada." : `${count} listas descartadas.` });
}
