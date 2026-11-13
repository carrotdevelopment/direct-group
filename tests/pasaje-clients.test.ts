import { describe, expect, it } from "vitest";
import { canActForClient, canApprovePasaje, canCancelPasaje, canReceivePasaje, canSeePasaje, isPasajeCreator } from "@/lib/module-access";

describe("canActForClient", () => {
  it("el administrador opera con cualquier cliente", () => {
    expect(canActForClient({ role: "ADMIN", clients: [] }, "Santander")).toBe(true);
  });

  it("un operador solo opera con sus clientes asignados, sin distinguir mayúsculas", () => {
    const actor = { role: "VENDEDOR", clients: ["Santander", " Macro "] };
    expect(canActForClient(actor, "santander")).toBe(true);
    expect(canActForClient(actor, "MACRO")).toBe(true);
    expect(canActForClient(actor, "HSBC")).toBe(false);
  });

  it("sin clientes asignados no puede operar", () => {
    expect(canActForClient({ role: "VENDEDOR", clients: [] }, "Santander")).toBe(false);
  });
});

describe("pasajes desde cualquier cliente", () => {
  const emilia = { name: "Emilia", role: "VENDEDOR", clients: ["Santander", "Umiles"] };
  const liz = { name: "Liz", role: "VENDEDOR", clients: ["Umiles"] };
  const pasaje = { fromClient: "Credicoop", toClient: "Umiles", createdBy: "Emilia" };

  it("quien lo cargó lo ve y lo puede cancelar, pero no lo aprueba sin tener el cliente origen", () => {
    expect(canSeePasaje(emilia, pasaje)).toBe(true);
    expect(canCancelPasaje(emilia, pasaje)).toBe(true);
    expect(canApprovePasaje(emilia, pasaje)).toBe(false);
  });

  it("la encargada del destino confirma lo que llegó, pero no aprueba ni cancela el envío", () => {
    expect(canSeePasaje(liz, pasaje)).toBe(true);
    expect(canReceivePasaje(liz, pasaje)).toBe(true);
    expect(canApprovePasaje(liz, pasaje)).toBe(false);
    expect(canCancelPasaje(liz, pasaje)).toBe(false);
  });

  it("la encargada del origen lo aprueba y lo puede cancelar", () => {
    const ana = { name: "Ana", role: "VENDEDOR", clients: ["Credicoop"] };
    expect(canApprovePasaje(ana, pasaje)).toBe(true);
    expect(canCancelPasaje(ana, pasaje)).toBe(true);
    expect(canReceivePasaje(ana, pasaje)).toBe(false);
  });

  it("un usuario sin relación con el pasaje no lo ve ni lo confirma", () => {
    const otro = { name: "Otro", role: "VENDEDOR", clients: ["Pampa"] };
    expect(canSeePasaje(otro, pasaje)).toBe(false);
    expect(canApprovePasaje(otro, pasaje)).toBe(false);
    expect(canReceivePasaje(otro, pasaje)).toBe(false);
  });

  it("el administrador ve y confirma todo", () => {
    const admin = { name: "Admin", role: "ADMIN", clients: [] };
    expect(canSeePasaje(admin, pasaje)).toBe(true);
    expect(canApprovePasaje(admin, pasaje)).toBe(true);
    expect(canReceivePasaje(admin, pasaje)).toBe(true);
  });

  it("un nombre vacío no cuenta como autor", () => {
    expect(isPasajeCreator({ name: " " }, { createdBy: " " })).toBe(false);
  });
});
