import { describe, expect, it } from "vitest";
import { canApprovePasaje, canSeePasaje } from "@/lib/module-access";
import { pasajeMailRecipients, pasajeMailText, type MailUser } from "@/lib/pasaje-notify-text";

const pasaje = (fromClient: string, toClient: string, quantity = 2) => ({
  fromClient, fromClientCode: "4258", toClient, toClientCode: "URB-321", product: "Freidora", uniqueCode: "fr-8612", quantity, createdBy: "Liz",
});
const user = (name: string, pasajeClients: string[], extra: Partial<MailUser> = {}): MailUser => ({
  name, email: `${name.toLowerCase()}@example.com`, role: "VENDEDOR", moduleAccess: ["pasajes"], pasajeClients, ...extra,
});

describe("correos de pasajes", () => {
  const users = [
    user("Betiana", ["Amex", "Credicoop"]),
    user("Emilia", ["Umiles"]),
    user("Liz", ["Umiles"]),
    user("Rosario", ["Credicoop"], { moduleAccess: ["correos"] }),
  ];
  const pasajes = [pasaje("Credicoop", "Umiles"), pasaje("Amex", "Umiles", 1), pasaje("Pampa", "Umiles")];

  it("para aprobar va a la encargada del origen, con todos sus pasajes en un solo correo", () => {
    const result = pasajeMailRecipients("aprobar", pasajes, users, "Liz");
    expect(result.map((item) => [item.user.name, item.pasajes.length])).toEqual([["Betiana", 2]]);
  });

  it("para recibir va a la encargada del destino, salvo a quien aprobó", () => {
    const result = pasajeMailRecipients("recibir", pasajes, users, "Liz");
    expect(result.map((item) => item.user.name)).toEqual(["Emilia"]);
  });

  it("el texto dice qué hay que hacer y lista cada pasaje", () => {
    const { subject, text } = pasajeMailText("aprobar", pasajes.slice(0, 2), "Betiana", "Liz", "https://x/pasajes");
    expect(subject).toBe("Pasajes para aprobar: 2 pasajes de Credicoop, Amex");
    expect(text).toContain("Liz cargó 2 pasajes desde Credicoop, Amex que esperan tu aprobación");
    expect(text).toContain("• Credicoop 4258 → Umiles URB-321 · Freidora · 2 u.");
    expect(text).toContain("https://x/pasajes");
  });
});

describe("encargada de pasajes", () => {
  const liz = { name: "Liz", role: "VENDEDOR", clients: ["Umiles"], seesAll: true };
  const other = { fromClient: "Credicoop", toClient: "Amex", createdBy: "Betiana" };
  it("ve los pasajes de cualquier cliente pero no aprueba los de otra encargada", () => {
    expect(canSeePasaje(liz, other)).toBe(true);
    expect(canApprovePasaje(liz, other)).toBe(false);
    expect(canSeePasaje({ ...liz, seesAll: false }, other)).toBe(false);
  });
});
