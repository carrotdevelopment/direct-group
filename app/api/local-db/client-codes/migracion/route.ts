import { checkApiAccess, currentPasajeActor } from "@/server/lib/access";
import { NextResponse } from "next/server";
import {
  ClientCodeMigrationError,
  executeClientCodeMigration,
  listClientCodeMigrations,
  previewClientCodeMigration,
} from "@/lib/client-code-migration-db";

export const runtime = "nodejs";

export async function GET() {
  const denied = await checkApiAccess(["clientes"], false);
  if (denied) return denied;
  return NextResponse.json({ migrations: await listClientCodeMigrations() });
}

// Con preview=true valida y muestra el stock que se va a pasar; si no, ejecuta la migración.
export async function POST(request: Request) {
  let body: { client?: unknown; oldCode?: unknown; newCode?: unknown; preview?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "El pedido no llegó con JSON válido." }, { status: 400 });
  }
  const denied = await checkApiAccess(["clientes"], !body.preview);
  if (denied) return denied;
  try {
    if (body.preview) return NextResponse.json({ plan: await previewClientCodeMigration(body) });
    return NextResponse.json(await executeClientCodeMigration(body, (await currentPasajeActor()).name));
  } catch (error) {
    if (error instanceof ClientCodeMigrationError) return NextResponse.json({ message: error.message }, { status: error.status });
    throw error;
  }
}
