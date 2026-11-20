import { checkApiAccess, clientForbidden, currentClientScope, currentPasajeActor } from "@/server/lib/access";
import { filterByClientScope, inClientScope } from "@/lib/client-scope";
import { NextResponse } from "next/server";
import {
  ClientCodeMigrationError,
  executeClientCodeMigration,
  transferClientCodeStock,
  listClientCodeMigrations,
  previewClientCodeMigration,
} from "@/lib/client-code-migration-db";

export const runtime = "nodejs";

export async function GET() {
  const denied = await checkApiAccess(["clientes"], false);
  if (denied) return denied;
  return NextResponse.json({ migrations: filterByClientScope(await currentClientScope(), await listClientCodeMigrations(), (migration) => migration.client) });
}

// Con preview=true valida y muestra el stock que se va a pasar; con onlyStock=true pasa el stock de un
// reemplazo ya guardado; si no, ejecuta la migración completa.
export async function POST(request: Request) {
  let body: { client?: unknown; oldCode?: unknown; newCode?: unknown; preview?: boolean; onlyStock?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "El pedido no llegó con JSON válido." }, { status: 400 });
  }
  const denied = await checkApiAccess(["clientes"], !body.preview);
  if (denied) return denied;
  if (!inClientScope(await currentClientScope(), body.client)) return clientForbidden();
  try {
    if (body.preview) return NextResponse.json({ plan: await previewClientCodeMigration(body) });
    // Reemplazo de código desde la carga de Códigos cliente: solo pasa el stock del viejo al nuevo.
    if (body.onlyStock) return NextResponse.json(await transferClientCodeStock(body, (await currentPasajeActor()).name));
    return NextResponse.json(await executeClientCodeMigration(body, (await currentPasajeActor()).name));
  } catch (error) {
    if (error instanceof ClientCodeMigrationError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
