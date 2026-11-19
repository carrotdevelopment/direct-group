import { checkApiAccess } from "@/server/lib/access";
import { readRequestTemplate } from "@/lib/pasaje-request-template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Planilla original de la solicitud de pasaje: el navegador la completa con la grilla de carga.
export async function GET() {
  const denied = await checkApiAccess(["pasajes"], false);
  if (denied) return denied;
  return new Response(new Uint8Array(await readRequestTemplate()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Cache-Control": "private, no-store",
    },
  });
}
