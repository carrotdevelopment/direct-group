import { describe, expect, it } from "vitest";
import { markDuplicates, parseSolicitudSheet, resolveSolicitud, type ClientCodeRecord, type ShipperRecord } from "@/lib/pasaje-solicitud";

const header = ["FECHA", "SH", "SKU VIEJO", "DESCRIPCION", "CANT ", "", "SH", "SKU NUEVO", "DESCRIPCION", "CANT", "", "COSTO $"];
const sheet = [
  ["", "Solicitud de pasaje de Stock"],
  ["ORIGEN", "", "", "", "", "", "DESTINO"],
  header,
  [46296, 1315, "75-5030", "Cortador de vegetales (30433)", 30, "", 1315, "76-5030", "Cortador de vegetales (30433)", 30, "", ""],
  ["", "", "", "", "", "", "", "", "", "", "", ""],
  [46296, 1247, "imp-2026", "Set de organizadores de viaje GS146", 50, "", 1315, "76-5006", "Set de organizadores de viaje GS146", 50],
];

const shippers: ShipperRecord[] = [
  { code: "1315", name: "BCO LA PAMPA", clients: ["Pampa"], active: true },
  { code: "1247", name: "CREDICOOP", clients: ["Credicoop"], active: true },
  { code: "3102", name: "UMILES/MACRO", clients: ["Umiles", "Macro"], active: true },
  { code: "1258", name: "AMEX", clients: ["Amex"], active: true },
];
const code = (client: string, clientCode: string, uniqueCode: string, active = true, voided = false): ClientCodeRecord => ({ client, clientCode, uniqueCode, active, voided });
const codes = [
  code("Pampa", "75-5030", "30433", false),
  code("Pampa", "76-5030", "30433"),
  code("Importados", "IMP-2026", "gs146", false),
  code("Pampa", "76-5006", "gs146"),
  code("Umiles", "URB-294", "hb1002-ar"),
  code("Pampa", "76-5018", "hb1002-ar"),
  code("Pampa", "76-5017", "kymq-45a"),
  code("Amex", "DG99-3105", "hfej415", false),
  code("Pampa", "76-5060", "hfej415", false),
  code("Pampa", "76-5099", "otro-sku"),
  code("Amex", "DG99-3184", "to4500-ar", false),
  code("Pampa", "76-5026", "to4500-ar"),
];
// Pasaje entre dos clientes: Amex (código que se da de baja) → Pampa.
const row = (overrides: Partial<ReturnType<typeof parseSolicitudSheet>[number]>) => ({
  row: 10, requestDate: "2026-10-01", fromShipper: "1258", fromClientCode: "DG99-3184", fromDescription: "", fromQuantity: 5,
  toShipper: "1315", toClientCode: "76-5026", toDescription: "", toQuantity: 5, ...overrides,
});
const sameClientRow = { fromShipper: "1315", fromClientCode: "75-5030", toShipper: "1315", toClientCode: "76-5030" };

describe("lectura de la solicitud de pasaje a Urbano", () => {
  it("encuentra los títulos, toma cada columna por su título y numera las filas como en Excel", () => {
    const rows = parseSolicitudSheet(sheet, 3);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      row: 6, requestDate: "2026-10-01", fromShipper: "1315", fromClientCode: "75-5030", fromDescription: "Cortador de vegetales (30433)",
      fromQuantity: 30, toShipper: "1315", toClientCode: "76-5030", toDescription: "Cortador de vegetales (30433)", toQuantity: 30,
    });
    expect(rows[1]).toMatchObject({ row: 8, fromShipper: "1247", fromClientCode: "imp-2026", toClientCode: "76-5006", fromQuantity: 50 });
  });

  it("sin la fila de títulos avisa en vez de leer cualquier cosa", () => {
    expect(() => parseSolicitudSheet([["a", "b"], [1, 2]])).toThrow("SKU VIEJO");
  });
});

describe("resolución de cada pasaje", () => {
  it("el shipper da el cliente y el origen puede ser un código que se da de baja", () => {
    const [result] = resolveSolicitud([row({})], codes, shippers);
    expect(result).toMatchObject({ status: "ok", fromClient: "Amex", toClient: "Pampa", uniqueCode: "to4500-ar", quantity: 5, messages: [] });
  });

  it("si el código es de otro cliente que el del shipper, usa el dueño del código y deja aviso", () => {
    const [result] = resolveSolicitud([row({ fromShipper: "1247", fromClientCode: "imp-2026", toClientCode: "76-5006" })], codes, shippers);
    expect(result.status).toBe("warning");
    expect(result.fromClient).toBe("Importados");
    expect(result.messages.join(" ")).toContain("CREDICOOP");
  });

  it("un shipper con dos clientes elige por el código", () => {
    const [result] = resolveSolicitud([row({ fromShipper: "3102", fromClientCode: "URB-294", toClientCode: "76-5018" })], codes, shippers);
    expect(result).toMatchObject({ status: "ok", fromClient: "Umiles", toClient: "Pampa" });
  });

  it("marca como error un código inexistente, un destino no vigente y productos distintos", () => {
    const [missing, inactive, different] = resolveSolicitud([
      row({ fromShipper: "1258", fromClientCode: "OFED-6247", toClientCode: "76-5030" }),
      row({ fromShipper: "1258", fromClientCode: "DG99-3105", toClientCode: "76-5060" }),
      row({ toClientCode: "76-5099" }),
    ], codes, shippers);
    expect(missing).toMatchObject({ status: "error", fromClient: null });
    expect(missing.messages[0]).toContain("OFED-6247");
    expect(inactive.messages.join(" ")).toContain("no está vigente");
    expect(different.messages.join(" ")).toContain("no son el mismo producto");
  });

  it("avisa si la cantidad del origen y la del destino no coinciden, y exige cantidad positiva", () => {
    const [mismatch, zero] = resolveSolicitud([row({ toQuantity: 4 }), row({ fromQuantity: 0, toQuantity: 0 })], codes, shippers);
    expect(mismatch).toMatchObject({ status: "warning", quantity: 5 });
    expect(zero.status).toBe("error");
  });

  it("un shipper que no está en la tabla no bloquea: se usa el código y queda aviso", () => {
    const [result] = resolveSolicitud([row({ fromShipper: "9999" })], codes, shippers);
    expect(result).toMatchObject({ status: "warning", fromClient: "Amex" });
  });
});

describe("cambios de código del mismo cliente y duplicados", () => {
  it("un pasaje dentro del mismo cliente es un cambio de código y no se carga acá", () => {
    const [result] = resolveSolicitud([row(sameClientRow)], codes, shippers);
    expect(result.status).toBe("excluded");
    expect(result.messages[0]).toContain("Cambio de código del mismo cliente (Pampa)");
  });

  it("un pasaje del mismo cliente con cantidad inválida sigue siendo un error", () => {
    const [result] = resolveSolicitud([row({ ...sameClientRow, fromQuantity: 0, toQuantity: 0 })], codes, shippers);
    expect(result.status).toBe("error");
  });

  it("marca como cargada una fila igual a un pasaje existente no rechazado, y avisa repetidas en el archivo", () => {
    const resolved = resolveSolicitud([
      row({ row: 10, fromShipper: "3102", fromClientCode: "URB-294", toClientCode: "76-5018" }),
      row({ row: 11, fromShipper: "3102", fromClientCode: "urb-294", toClientCode: "76-5018" }),
      row({ row: 12, fromShipper: "1247", fromClientCode: "imp-2026", toClientCode: "76-5006" }),
    ], codes, shippers);
    const existing = [
      { fromClientCode: "IMP-2026", toClientCode: "76-5006", quantity: 5, requestDate: "2026-10-01", status: "approved", createdBy: "Liz", createdAt: "2026-10-02T12:00:00.000Z" },
      { fromClientCode: "URB-294", toClientCode: "76-5018", quantity: 5, requestDate: "2026-10-01", status: "rejected", createdBy: "Liz", createdAt: "2026-10-02T12:00:00.000Z" },
    ];
    const [first, repeated, loaded] = markDuplicates(resolved, existing);
    expect(first.status).toBe("ok");
    expect(repeated.status).toBe("warning");
    expect(repeated.messages.join(" ")).toContain("igual a la fila 10");
    expect(loaded.status).toBe("error");
    expect(loaded.messages[0]).toContain("Ya está cargado: hay un pasaje igual (aprobado)");
  });
});
