import { NextResponse } from "next/server";
import { getConfiguredMailFrom, sendSmtpMail } from "@/lib/smtp-mailer";

export const runtime = "nodejs";

type SendPriceRequestBody = {
  supplier?: string;
  contactName?: string;
  email?: string;
};

export async function POST(request: Request) {
  let body: SendPriceRequestBody;
  try {
    const rawBody = await request.text();
    body = rawBody
      ? (JSON.parse(rawBody) as SendPriceRequestBody)
      : ({} as SendPriceRequestBody);
  } catch {
    return NextResponse.json(
      { ok: false, message: "El pedido no llegó con JSON válido." },
      { status: 400 },
    );
  }

  const supplier = String(body.supplier || "").trim();
  const contactName = String(body.contactName || "").trim();
  const email = String(body.email || "").trim();

  if (!supplier || !email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json(
      { ok: false, message: "Proveedor o correo inválido." },
      { status: 400 },
    );
  }

  const month = new Intl.DateTimeFormat("es-AR", {
    month: "long",
    year: "numeric",
  }).format(new Date());

  const greeting = contactName ? `Hola ${contactName},` : "Hola,";
  const text = [
    greeting,
    "",
    `Desde Direct Group te solicitamos por favor la lista de precios actualizada correspondiente a ${month}.`,
    "",
    "Idealmente enviar el archivo con: código de producto/proveedor, descripción, costo DG, IVA, precio público y markup si corresponde.",
    "",
    "Muchas gracias.",
    "",
    "Direct Group",
  ].join("\n");

  try {
    const result = await sendSmtpMail({
      to: email,
      subject: `Solicitud de lista de precios - ${supplier}`,
      text,
    });
    return NextResponse.json({
      ok: true,
      from: result.from,
      message: `Mail enviado a ${email}.`,
    });
  } catch (error) {
    const fallbackFrom = getConfiguredMailFrom();
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo enviar el mail de prueba.";
    return NextResponse.json(
      {
        ok: false,
        from: fallbackFrom,
        message,
      },
      { status: 200 },
    );
  }
}
