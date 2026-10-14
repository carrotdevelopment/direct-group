import { describe, expect, it } from "vitest";
import { canActForClient, canConfirmPasaje, canSeePasaje, isPasajeCreator } from "@/lib/module-access";

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

  it("quien lo generó lo ve y puede confirmar el envío aunque no tenga el cliente origen", () => {
    expect(canSeePasaje(emilia, pasaje)).toBe(true);
    expect(canConfirmPasaje(emilia, pasaje)).toBe(true);
  });

  it("quien tiene el destino lo ve, pero no confirma el envío de un origen ajeno", () => {
    expect(canSeePasaje(liz, pasaje)).toBe(true);
    expect(canConfirmPasaje(liz, pasaje)).toBe(false);
  });

  it("un usuario sin relación con el pasaje no lo ve ni lo confirma", () => {
    const otro = { name: "Otro", role: "VENDEDOR", clients: ["Pampa"] };
    expect(canSeePasaje(otro, pasaje)).toBe(false);
    expect(canConfirmPasaje(otro, pasaje)).toBe(false);
  });

  it("el administrador ve y confirma todo", () => {
    const admin = { name: "Admin", role: "ADMIN", clients: [] };
    expect(canSeePasaje(admin, pasaje)).toBe(true);
    expect(canConfirmPasaje(admin, pasaje)).toBe(true);
  });

  it("un nombre vacío no cuenta como autor", () => {
    expect(isPasajeCreator({ name: " " }, { createdBy: " " })).toBe(false);
  });
});
