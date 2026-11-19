// Destinatarios y texto de los correos de pasajes (sin acceso a la base, para poder probarlo).

export type PasajeMailKind = "aprobar" | "recibir";

export type MailPasaje = {
  fromClient: string;
  fromClientCode: string;
  toClient: string;
  toClientCode: string;
  product: string | null;
  uniqueCode: string;
  quantity: unknown;
  createdBy: string;
};

export type MailUser = { name: string; email: string; role: string; moduleAccess: string[]; pasajeClients: string[] };

const same = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

// A quién le toca cada pasaje: la encargada del origen para aprobar, la del destino para recibir. Tiene que
// tener el módulo Pasajes (o ser administradora) y el cliente asignado. No se avisa a quien hizo la acción.
export function pasajeMailRecipients<P extends MailPasaje>(kind: PasajeMailKind, pasajes: P[], users: MailUser[], actorName: string) {
  const result: { user: MailUser; pasajes: P[] }[] = [];
  for (const user of users) {
    if (!user.email || same(user.name, actorName)) continue;
    if (user.role !== "ADMIN" && !user.moduleAccess.includes("pasajes")) continue;
    const own = pasajes.filter((pasaje) =>
      user.pasajeClients.some((client) => same(client, kind === "aprobar" ? pasaje.fromClient : pasaje.toClient)));
    if (own.length) result.push({ user, pasajes: own });
  }
  return result;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function pasajeMailText(kind: PasajeMailKind, pasajes: MailPasaje[], userName: string, actorName: string, link: string) {
  const clients = [...new Set(pasajes.map((pasaje) => (kind === "aprobar" ? pasaje.fromClient : pasaje.toClient)))].join(", ");
  const count = plural(pasajes.length, "pasaje", "pasajes");
  const subject = kind === "aprobar" ? `Pasajes para aprobar: ${count} de ${clients}` : `Pasajes aprobados para recibir: ${count} hacia ${clients}`;
  const intro = kind === "aprobar"
    ? `${actorName} cargó ${count} desde ${clients} que ${pasajes.length === 1 ? "espera" : "esperan"} tu aprobación como encargada del origen.`
    : `${actorName} aprobó ${count} hacia ${clients}. Cuando Urbano avise que ${pasajes.length === 1 ? "llegó" : "llegaron"}, confirmá la cantidad recibida.`;
  const lines = pasajes.map((pasaje) =>
    `• ${pasaje.fromClient} ${pasaje.fromClientCode} → ${pasaje.toClient} ${pasaje.toClientCode} · ${pasaje.product || pasaje.uniqueCode} · ${Number(pasaje.quantity)} u.`);
  const text = [
    `Hola ${userName}:`,
    "",
    intro,
    "",
    ...lines,
    "",
    kind === "aprobar" ? `Para aprobarlos o rechazarlos: ${link}` : `Para confirmarlos: ${link}`,
    "",
    "Aviso automático de DG Plataforma.",
  ].join("\n");
  return { subject, text };
}
