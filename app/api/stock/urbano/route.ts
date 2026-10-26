import { auth } from "@/auth";
import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import {
  UrbanoStockError,
  deleteUrbanoStockLoad,
  listUrbanoStockLoads,
  previewUrbanoStock,
  saveUrbanoStock,
  syncUrbanoStockFromPortal,
  urbanoStockItems,
} from "@/lib/urbano-stock-db";
import { UrbanoPortalError, urbanoPortalConfig } from "@/lib/urbano-portal";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(error: unknown) {
  if (error instanceof UrbanoStockError) return NextResponse.json({ message: error.message }, { status: error.status });
  if (error instanceof UrbanoPortalError) return NextResponse.json({ message: error.message }, { status: 502 });
  throw error;
}

// Cargas del reporte de stock de Urbano; con ?load=<id> devuelve los renglones de esa carga.
export async function GET(request: Request) {
  const denied = await checkApiAccess(["stock"], false);
  if (denied) return denied;
  const loadId = new URL(request.url).searchParams.get("load");
  if (loadId && !UUID.test(loadId)) return NextResponse.json({ message: "La carga no existe." }, { status: 404 });
  if (loadId) return NextResponse.json({ items: await urbanoStockItems(loadId) });
  return NextResponse.json({ loads: await listUrbanoStockLoads(), portalConfigured: !!urbanoPortalConfig() });
}

// Con preview=true solo cruza las filas con Códigos cliente; con portal=true trae el reporte del portal
// de Urbano; si no, guarda la carga del Excel.
export async function POST(request: Request) {
  const denied = await checkApiAccess(["stock"], true);
  if (denied) return denied;
  let body: { rows?: unknown; fileName?: unknown; fileHash?: unknown; reportDate?: unknown; preview?: boolean; portal?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "El pedido no llegó con JSON válido." }, { status: 400 });
  }
  try {
    if (body.preview) return NextResponse.json(await previewUrbanoStock(body.rows, body.fileHash, body.reportDate));
    const user = (await auth())?.user;
    const actor = user?.name || user?.email || "desconocido";
    if (body.portal) return NextResponse.json(await syncUrbanoStockFromPortal(actor));
    return NextResponse.json(await saveUrbanoStock(body.rows, body.fileName, body.fileHash, body.reportDate, actor));
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  const denied = await checkApiAccess(["stock"], true);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("load") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ message: "La carga no existe." }, { status: 404 });
  try {
    await deleteUrbanoStockLoad(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
