import { auth } from "@/auth";
import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { isSettingKey, settingSchemas } from "@/lib/org-settings";
import { readSetting, writeSetting } from "@/lib/system-health";
import { sendSmtpMail } from "@/lib/smtp-mailer";

export const runtime = "nodejs";

// Guarda una sección de Sistema > Configuración ({ key, value }); con { test: true } manda un correo de
// prueba a los destinatarios de avisos guardados. Solo administradores, salvo los correos a proveedores.
export async function POST(request: Request) {
  let body: { key?: unknown; value?: unknown; test?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "El pedido no llegó con JSON válido." }, { status: 400 });
  }
  // Los textos de los correos a proveedores los puede editar también quien tiene el módulo Precios.
  const denied = await checkApiAccess(body.key === "correoProveedores" && !body.test ? ["admin", "precios"] : ["admin"], true);
  if (denied) return denied;
  const user = (await auth())?.user;
  const actor = user?.name || user?.email || "desconocido";

  if (body.test) {
    const { value } = await readSetting("notificaciones");
    if (!value.recipients.length) return NextResponse.json({ message: "Guardá al menos un destinatario antes de probar." }, { status: 400 });
    const failed: string[] = [];
    for (const to of value.recipients) {
      try {
        await sendSmtpMail({
          to,
          subject: "Prueba de avisos de la plataforma",
          text: `Este es un correo de prueba enviado por ${actor} desde Sistema > Configuración > Notificaciones.\nSi lo recibiste, los avisos van a llegar a esta casilla.`,
        });
      } catch (error) {
        failed.push(`${to} (${error instanceof Error ? error.message : "error"})`);
      }
    }
    if (failed.length) return NextResponse.json({ message: `No se pudo enviar a: ${failed.join("; ")}.` }, { status: 502 });
    return NextResponse.json({ sent: value.recipients });
  }

  if (!isSettingKey(body.key)) return NextResponse.json({ message: "Sección de configuración desconocida." }, { status: 400 });
  const parsed = settingSchemas[body.key].safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Datos inválidos." }, { status: 400 });
  await writeSetting(body.key, parsed.data, actor);
  return NextResponse.json(await readSetting(body.key));
}
