import { describe, expect, it } from "vitest";
import {
  parseUrbanoStockSheet,
  reportDateFromFileName,
  resolveUrbanoStock,
  urbanoNumber,
  urbanoStockTableFromHtml,
  type UrbanoClientCode,
} from "@/lib/urbano-stock";

const titles = ["Cod. Compañia", "Compañia", "Cod. Producto", "Producto", "Id estado", "Estado", "Emplazamiento", "Almacenamiento", "Lote", "Vto.", "Serie", "Cant. Fisica", "Cant. Pendiente Almacenar", "Cant. Pendiente Recogida"];
const line = (code: string, product: string, stateId: string, physical: string | number, pending: string | number) =>
  ["310", "DIRECT GROUP - MACRO", code, product, stateId, stateId === "DIS" ? "DISPONIBLE" : "NO DISPONIBLE", "PLANTA", "ASCASUBI", "-", "Vto no disponible", "-", physical, "", pending];
const sheet = [
  ["Stock en Linea-26-10-2026"],
  titles,
  line("00000000URB-045", "DESTORNILLADOR  GY-DI-16000", "DIS", "0.00", "3.00"),
  line("00000000URB-080", "Cámara de seguridad", "DIS", "16.00", "1.00"),
  line("00000000URB-080", "Cámara de seguridad", "NOD", "2.00", "0.00"),
  line("00000000URB-080", "Cámara de seguridad", "DIS", 4, 0),
];

const code = (client: string, clientCode: string, uniqueCode: string, active = true, voided = false): UrbanoClientCode => ({ client, clientCode, uniqueCode, active, voided });
const codes = [
  code("Umiles", "URB-045", "gy-di-16000"),
  code("Umiles", "URB-080", "lsp046175a14", false),
  code("Macro", "URB-080", "lsp046175a14", true, true),
];

describe("lectura del reporte Stock en línea de Urbano", () => {
  it("agrupa por código: física disponible, física en otros estados y pendiente de recogida", () => {
    expect(parseUrbanoStockSheet(sheet)).toEqual([
      { row: 3, clientCode: "URB-045", product: "DESTORNILLADOR GY-DI-16000", quantity: 0, unavailable: 0, pendingPickup: 3, company: "310" },
      { row: 4, clientCode: "URB-080", product: "Cámara de seguridad", quantity: 20, unavailable: 2, pendingPickup: 1, company: "310" },
    ]);
  });

  it("si el Excel se exportó sin la columna Cant. Fisica, pide mostrar todas las columnas", () => {
    expect(() => parseUrbanoStockSheet([["Cod. Producto", "Producto", "Cant. Pendiente Recogida"], ["URB-045", "x", 3]])).toThrow("Mostrar/Ocultar");
    expect(() => parseUrbanoStockSheet([["a", "b"], [1, 2]])).toThrow("Cod. Producto");
  });

  it("lee números del portal y de Excel argentino", () => {
    expect(urbanoNumber("5.00")).toBe(5);
    expect(urbanoNumber("1,234.50")).toBe(1234.5);
    expect(urbanoNumber("1.234,5")).toBe(1234.5);
    expect(urbanoNumber("1.234")).toBe(1234);
    expect(urbanoNumber("")).toBe(0);
    expect(urbanoNumber("abc")).toBeNaN();
  });

  it("lee la tabla HTML que devuelve el portal", () => {
    const html = `<div><table id="table-wms-stock" class="table"><thead><tr><th>Cod. Producto</th><th>Producto</th><th>Cant. Fisica</th></tr></thead>
      <tbody><tr><td>00000000URB-021</td><td>OLLA MULTIFUNCI&Oacute;N &amp; TAPA   </td><td style="text-align: center">5.00</td></tr></tbody></table></div>`;
    const matrix = urbanoStockTableFromHtml(html);
    expect(matrix).toEqual([["Cod. Producto", "Producto", "Cant. Fisica"], ["00000000URB-021", "OLLA MULTIFUNCI&Oacute;N & TAPA", "5.00"]]);
    expect(parseUrbanoStockSheet(matrix)[0]).toMatchObject({ clientCode: "URB-021", quantity: 5 });
    expect(() => urbanoStockTableFromHtml("<html>sesión vencida</html>")).toThrow("tabla de stock");
  });

  it("saca la fecha del nombre del archivo del portal", () => {
    expect(reportDateFromFileName("Stock en Linea-22-10-2026.xlsx")).toBe("2026-10-22");
    expect(reportDateFromFileName("Stock en Linea-31-02-2026.xlsx")).toBeNull();
    expect(reportDateFromFileName("stock.xlsx")).toBeNull();
  });
});

describe("cruce con Códigos cliente", () => {
  it("resuelve el cliente, avisa códigos no vigentes o desconocidos y rechaza cantidades inválidas", () => {
    const rows = parseUrbanoStockSheet([...sheet, line("URB-999", "Sin código", "DIS", 1, 0), line("URB-050", "Mal", "DIS", "abc", 0)]);
    const [ok, inactive, unknown, invalid] = resolveUrbanoStock(rows, codes);
    expect(ok).toMatchObject({ status: "ok", client: "Umiles", uniqueCode: "gy-di-16000", messages: [] });
    expect(inactive).toMatchObject({ status: "warning", client: "Umiles" });
    expect(inactive.messages[0]).toContain("no está vigente");
    expect(unknown).toMatchObject({ status: "warning", client: null });
    expect(invalid.status).toBe("error");
  });
});

describe("códigos de Urbano que quedan iguales sin los ceros", () => {
  it("no suma productos distintos y no guarda ninguno de los dos", () => {
    const rows = parseUrbanoStockSheet([titles, line("00000000URB-372", "RELOJ DESPERTADOR", "DIS", 2, 0), line("0000000URB-372", "Kit Entrenamiento", "DIS", 14, 0)]);
    expect(rows.map((row) => [row.clientCode, row.quantity])).toEqual([["URB-372", 2], ["URB-372", 14]]);
    const [first, second] = resolveUrbanoStock(rows, codes);
    expect(first.status).toBe("error");
    expect(first.messages.join(" ")).toContain("la fila 3");
    expect(second.status).toBe("error");
  });
});
