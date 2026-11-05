import { describe, expect, it } from "vitest";
import { urbanoApiDate, urbanoApiMovementRows, urbanoApiStockRows, urbanoCodeFinder } from "@/lib/urbano-api-rows";
import { urbanoClientCode } from "@/lib/urbano-stock";

const movement = (overrides: Record<string, unknown> = {}) => ({
  tipo: "PICKING", fecha: "02-11-2026 12:36:56", numerocomprobante: "C10010061691710", usuario: "Operario", proveedor: "0151733863",
  razonsocial: "Persona Destinataria", comp_id: "310", prod_id: "00000000URB-385", prod_descripcion: "Masajeador  de mano", lote: "", fechavencimiento: "Vto no cargado",
  serie: "", entrada: "0.000", salida: "-1.000", saldo: "0.000", ...overrides,
});

describe("stock de la API de Urbano", () => {
  it("quita todos los ceros de adelante, también en los códigos numéricos", () => {
    expect(urbanoClientCode("00000000URB-021")).toBe("URB-021");
    expect(urbanoClientCode("000000000002339")).toBe("2339");
    expect(urbanoClientCode("000000072-5116A")).toBe("72-5116A");
    expect(urbanoClientCode("000")).toBe("0");
  });

  it("suma las filas repetidas y separa lo que no está disponible", () => {
    const rows = urbanoApiStockRows([
      { shipper: "DIRECT GROUP (CREDICOOP)", codigo: "000000000002427", nombre: "COMBO", stock: "4.00", estado: "DISPONIBLE" },
      { shipper: "DIRECT GROUP (CREDICOOP)", codigo: "000000000002427", nombre: "COMBO", stock: "1.00", estado: "DISPONIBLE" },
      { shipper: "DIRECT GROUP (CREDICOOP)", codigo: "000000000002427", nombre: "COMBO", stock: "2.00", estado: "NO DISPONIBLE" },
    ]);
    expect(rows).toEqual([{ row: 1, clientCode: "2427", product: "COMBO", quantity: 7, unavailable: 2, pendingPickup: 0, company: "247" }]);
  });

  it("acepta el nombre en false y una cuenta desconocida", () => {
    const [row] = urbanoApiStockRows([{ shipper: "AMEX CENTURIN", codigo: "000000CENT-0063", nombre: false, stock: "3.00", estado: "DISPONIBLE" }]);
    expect(row).toMatchObject({ clientCode: "CENT-0063", product: "", quantity: 3, company: "AMEX CENTURIN" });
  });

  it("toma el nombre de otra fila si el primero viene vacío", () => {
    const [row] = urbanoApiStockRows([
      { shipper: "DIRECT GROUP - MACRO", codigo: "00000000URB-075", nombre: false, stock: "1.00", estado: "DISPONIBLE" },
      { shipper: "DIRECT GROUP - MACRO", codigo: "00000000URB-075", nombre: "Tostadora", stock: "1.00", estado: "DISPONIBLE" },
    ]);
    expect(row.product).toBe("Tostadora");
  });
});

describe("movimientos de la API de Urbano", () => {
  it("interpreta la fecha en hora de Argentina", () => {
    expect(urbanoApiDate("05-11-2026 10:36:27")?.toISOString()).toBe("2026-11-05T13:36:27.000Z");
    expect(urbanoApiDate("2026-11-05")).toBeNull();
    expect(urbanoApiDate(false)).toBeNull();
  });

  it("guarda la salida como cantidad positiva y no conserva datos personales", () => {
    const { rows, skipped } = urbanoApiMovementRows([movement()]);
    expect(skipped).toBe(0);
    expect(rows[0]).toMatchObject({ type: "PICKING", clientCode: "URB-385", urbanoCode: "00000000URB-385", product: "Masajeador de mano", reference: "0151733863", company: "310", inQuantity: 0, outQuantity: 1, balance: 0, lot: null });
    expect(JSON.stringify(rows[0])).not.toContain("Persona Destinataria");
    expect(JSON.stringify(rows[0])).not.toContain("Operario");
  });

  it("da la misma clave al mismo movimiento y distinta a las dos filas de una transferencia", () => {
    const again = urbanoApiMovementRows([movement(), movement()]).rows;
    expect(again[0].key).toBe(again[1].key);
    const transfer = { tipo: "TRANSFERENCIA", numerocomprobante: "", proveedor: "", razonsocial: "" };
    const { rows } = urbanoApiMovementRows([
      movement({ ...transfer, entrada: "0.000", salida: "-22.000", saldo: "0.000" }),
      movement({ ...transfer, entrada: "22.000", salida: "0.000", saldo: "22.000" }),
    ]);
    expect(rows[0].key).not.toBe(rows[1].key);
    expect(rows[0].voucher).toBeNull();
  });

  it("descarta las filas que no se pueden leer", () => {
    const { rows, skipped } = urbanoApiMovementRows([movement({ fecha: "ayer" }), movement({ prod_id: "" }), movement({ salida: "abc" }), movement()]);
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(3);
  });
});

describe("cliente de cada código", () => {
  const code = (client: string, clientCode: string, active: boolean, voided = false) => ({ client, clientCode, uniqueCode: `${client}-u`, active, voided });

  it("prefiere el código vigente e ignora los anulados", () => {
    const find = urbanoCodeFinder([code("Viejo", "URB-1", false), code("Anulado", "URB-2", true, true), code("Actual", "urb-1", true)]);
    expect(find("URB-1")?.client).toBe("Actual");
    expect(find("URB-2")).toBeNull();
  });
});
