import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/excel-postgres-client-core", () => ({ excelPostgres: {} }));
vi.mock("@/lib/smtp-mailer", () => ({ sendSmtpMail: vi.fn() }));

import { buildPriceRequestMail, firstBusinessDay, isOnOrAfterFirstBusinessDay, periodOf } from "@/lib/supplier-mail";

describe("primer día hábil del mes", () => {
  it("usa el día 1 cuando cae de lunes a viernes", () => {
    expect(firstBusinessDay(2026, 10)).toBe(1); // jueves
  });

  it("salta sábado y domingo", () => {
    expect(firstBusinessDay(2026, 11)).toBe(2); // 1/11 es domingo
    expect(firstBusinessDay(2026, 8)).toBe(3); // 1/8 es sábado
  });

  it("no cuenta el 1 de enero ni el 1 de mayo aunque sean día de semana", () => {
    expect(firstBusinessDay(2026, 1)).toBe(2); // 1/1 jueves, feriado
    expect(firstBusinessDay(2026, 5)).toBe(4); // 1/5 viernes feriado; 2 y 3 son fin de semana
  });

  it("solo habilita el envío desde el primer día hábil", () => {
    expect(isOnOrAfterFirstBusinessDay(new Date("2026-11-01T15:00:00Z"))).toBe(false);
    expect(isOnOrAfterFirstBusinessDay(new Date("2026-11-02T15:00:00Z"))).toBe(true);
    expect(isOnOrAfterFirstBusinessDay(new Date("2026-11-20T15:00:00Z"))).toBe(true);
  });
});

describe("mensaje al proveedor", () => {
  const now = new Date("2026-11-02T18:00:00Z");

  it("saluda por nombre y pide el catálogo del mes", () => {
    const mail = buildPriceRequestMail("Ana", "ACEGAME", now);
    expect(mail.text.startsWith("Hola Ana, buenas tardes.")).toBe(true);
    expect(mail.text).toContain("catálogo de productos");
    expect(mail.subject).toContain("ACEGAME");
    expect(mail.subject).toContain("noviembre");
  });

  it("sin nombre usa un saludo genérico", () => {
    expect(buildPriceRequestMail("", "ACEGAME", now).text.startsWith("Hola, buenas tardes.")).toBe(true);
  });

  it("el período usa la hora de Argentina", () => {
    expect(periodOf(new Date("2026-11-01T01:00:00Z"))).toBe("2026-10");
  });
});
