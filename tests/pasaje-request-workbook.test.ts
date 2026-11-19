import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { requestRows, type ExportPasaje } from "@/lib/pasaje-export";
import { buildRequestWorkbook, REQUEST_TEMPLATE_FILE } from "@/lib/pasaje-request-workbook";
import { parseSolicitudSheet } from "@/lib/pasaje-solicitud";

const template = new Uint8Array(readFileSync(REQUEST_TEMPLATE_FILE));
const pasaje: ExportPasaje = {
  requestDate: "2026-11-12", fromShipper: "1258", fromClient: "Amex", fromClientCode: "DG99-3026", fromDescription: "Pava <eléctrica> & mate",
  toShipper: "1955", toClientCode: "10352", toDescription: "Pava eléctrica Peabody", quantity: 14,
};

function read(bytes: Uint8Array) {
  const workbook = XLSX.read(bytes, { type: "array" });
  return { workbook, sheet: workbook.Sheets[workbook.SheetNames[0]] };
}

describe("solicitud de pasaje con el formato de Urbano", () => {
  it("conserva el logo, la hoja SH, el título y pone la fecha", () => {
    const bytes = buildRequestWorkbook(template, requestRows([pasaje]), "2026-11-12");
    const zip = XLSX.CFB.read(bytes, { type: "array" });
    expect(XLSX.CFB.find(zip, "/xl/media/image1.png")).toBeTruthy();
    const { workbook, sheet } = read(bytes);
    expect(workbook.SheetNames).toEqual(["Hoja1", "SH"]);
    expect(sheet.B4.v).toBe("Solicitud de pasaje de Stock");
    expect(sheet.D5.v).toBe(46338);
  });

  it("pone las filas desde la 10, los totales y AUTORIZA debajo", () => {
    const rows = requestRows([pasaje, { ...pasaje, quantity: 6, fromClientCode: "DG99-1" }]);
    const { sheet } = read(buildRequestWorkbook(template, rows, "2026-11-12"));
    expect([sheet.A10.v, sheet.B10.v, sheet.C10.v, sheet.D10.v, sheet.E10.v]).toEqual([46338, 1258, "DG99-3026", "Pava <eléctrica> & mate", 14]);
    expect([sheet.G10.v, sheet.H10.v, sheet.I10.v, sheet.J10.v]).toEqual([1955, "10352", "Pava eléctrica Peabody", 14]);
    expect(sheet.D13.v).toBe("TOTAL  ORIGEN");
    expect([sheet.E13.f, sheet.E13.v, sheet.J13.v]).toEqual(["SUM(E10:E12)", 20, 20]);
    expect(sheet.D17.v).toBe("AUTORIZA");
    expect(sheet.D19.v).toBe("Direct Group");
    expect(sheet["!merges"]?.map((merge) => XLSX.utils.encode_range(merge))).toContain("D17:D18");
  });

  it("se puede volver a subir en la plataforma", () => {
    const { sheet } = read(buildRequestWorkbook(template, requestRows([pasaje]), "2026-11-12"));
    const [row, ...rest] = parseSolicitudSheet(XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true }));
    expect(rest).toHaveLength(0);
    expect(row).toMatchObject({
      requestDate: "2026-11-12", fromShipper: "1258", fromClientCode: "DG99-3026", fromQuantity: 14,
      toShipper: "1955", toClientCode: "10352", toQuantity: 14, toDescription: "Pava eléctrica Peabody",
    });
  });
});
