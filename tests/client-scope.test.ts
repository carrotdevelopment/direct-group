import { describe, expect, it } from "vitest";
import { clientScopeFor, filterByClientScope, inClientScope, restrictRequestedClients } from "@/lib/client-scope";

describe("clientScopeFor", () => {
  it("el administrador ve todos los clientes", () => {
    expect(clientScopeFor({ role: "ADMIN", pasajeClients: [] })).toBeNull();
  });

  it("los demás ven solo sus clientes asignados", () => {
    expect(clientScopeFor({ role: "VENDEDOR", pasajeClients: ["Amex", " Massalin ", "Amex", ""] })).toEqual(["Amex", "Massalin"]);
  });

  it("sin clientes asignados o sin sesión no ve ninguno", () => {
    expect(clientScopeFor({ role: "VENDEDOR", pasajeClients: [] })).toEqual([]);
    expect(clientScopeFor({ role: "VENDEDOR" })).toEqual([]);
    expect(clientScopeFor(undefined)).toEqual([]);
  });
});

describe("inClientScope", () => {
  it("compara sin distinguir mayúsculas, tildes ni espacios", () => {
    expect(inClientScope(["Amex", "Credicoop"], " amex ")).toBe(true);
    expect(inClientScope(["Umiles"], "UMILES")).toBe(true);
    expect(inClientScope(["Pampa"], "Producteca")).toBe(false);
  });

  it("no acepta un nombre vacío ni coincidencias parciales", () => {
    expect(inClientScope(["Amex"], "")).toBe(false);
    expect(inClientScope(["Amex"], "Amex Corporate")).toBe(false);
  });

  it("sin restricción acepta cualquiera", () => {
    expect(inClientScope(null, "Cualquiera")).toBe(true);
  });
});

describe("filterByClientScope", () => {
  const rows = [{ client: "Amex" }, { client: "Pampa" }, { client: "credicoop" }];

  it("deja solo las filas de los clientes permitidos", () => {
    expect(filterByClientScope(["Amex", "Credicoop"], rows, (row) => row.client)).toEqual([{ client: "Amex" }, { client: "credicoop" }]);
  });

  it("con lista vacía no deja nada y sin restricción deja todo", () => {
    expect(filterByClientScope([], rows, (row) => row.client)).toEqual([]);
    expect(filterByClientScope(null, rows, (row) => row.client)).toBe(rows);
  });
});

describe("restrictRequestedClients", () => {
  it("sin pedido usa todos sus clientes", () => {
    expect(restrictRequestedClients(["Amex", "Pampa"], [])).toEqual(["Amex", "Pampa"]);
  });

  it("descarta los clientes que no le corresponden", () => {
    expect(restrictRequestedClients(["Amex"], ["Amex", "Pampa"])).toEqual(["Amex"]);
  });

  it("si pidió solo clientes ajenos no devuelve todo", () => {
    const result = restrictRequestedClients(["Amex"], ["Pampa"]);
    expect(result).toHaveLength(1);
    expect(inClientScope(["Amex"], result[0])).toBe(false);
  });

  it("sin clientes asignados no coincide con nada", () => {
    expect(restrictRequestedClients([], [])).toHaveLength(1);
  });

  it("el administrador pide lo que quiera", () => {
    expect(restrictRequestedClients(null, ["Pampa"])).toEqual(["Pampa"]);
    expect(restrictRequestedClients(null, [])).toEqual([]);
  });
});
