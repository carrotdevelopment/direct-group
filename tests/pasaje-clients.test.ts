import { describe, expect, it } from "vitest";
import { canActForClient } from "@/lib/module-access";

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
