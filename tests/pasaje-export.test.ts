import { describe, expect, it } from "vitest";
import { certificate, excelSerial, requestSheet, urbanoIdSheet, urbanoUploadFileName, urbanoUploadSheet, type ExportPasaje } from "@/lib/pasaje-export";
import { parseSolicitudSheet } from "@/lib/pasaje-solicitud";

const pasaje: ExportPasaje = {
  requestDate: "2026-11-12", fromShipper: "1258", fromClient: "Amex", fromClientCode: "DG99-3026",
  fromDescription: "Pava eléctrica Peabody (PE-KA1708)", toShipper: "1955", toClientCode: "PROD-3026",
  toDescription: "Pava eléctrica Peabody", quantity: 14,
};

describe("Excel de pasajes para Urbano", () => {
  it("la planilla de carga sale igual a la que usan en Urbano", () => {
    const sheet = urbanoUploadSheet([pasaje, { ...pasaje, fromClientCode: "DG99-3102", quantity: 24 }], "2026-11-12");
    expect(sheet[0]).toEqual([
      "Descripcion", "", "N° cta MR", "N° Certificado", "Nombre y Apellido", "Domicilo", "Observaciones", "mail",
      "Observaciones", "Localidad", "Cod Postal", "MODALIDAD", "CANTIDAD",
    ]);
    expect(sheet[1]).toEqual([
      "Pava eléctrica Peabody (PE-KA1708)", "DG99-3026", "", "PAS1211AMEX1", "PASAJE DE STOCK", "ASCASUBI 3380", "", "", "", "BSAS", 9996, "E", 14,
    ]);
    expect(sheet[2][3]).toBe("PAS1211AMEX2");
    expect(urbanoUploadFileName("2026-11-12", "Amex", "1258")).toBe("PASAJE 12 NOVIEMBRE AMEX 1258.xlsx");
  });

  it("el certificado sigue la numeración del día y saca acentos y espacios del cliente", () => {
    expect(urbanoUploadSheet([pasaje], "2026-11-12", 5)[1][3]).toBe("PAS1211AMEX5");
    expect(certificate("2026-03-05", "Banco Nación", 1)).toBe("PAS0503BANCONACION1");
  });

  it("el formato con ID sale como la planilla de Credicoop", () => {
    const credicoop = { ...pasaje, fromShipper: "1247", fromClient: "Credicoop", fromClientCode: "4158", fromDescription: "Licuadora 600W", quantity: 1 };
    const sheet = urbanoIdSheet([credicoop], "2026-11-10");
    expect(sheet[0]).toEqual([
      "ID", "NOMBRE Y APELLIDO", "DIRECCIÓN", "CP", "PROVINCIA", "LOCALIDAD", "Código", "Cantidad", "Puntaje", "Fecha",
      "Producto", "Servicio", "Tel", "Celular",
    ]);
    expect(sheet[1]).toEqual([
      "PAS1011CREDI1", "PASAJE DE STOCK", "ASCASUBI 3380", 9996, "CABA", "BARRACAS", 4158, 1, "", excelSerial("2026-11-10"),
      "Licuadora 600W", "E", "", "",
    ]);
    expect(excelSerial("2026-11-10")).toBe(46336);
    expect(urbanoIdSheet([{ ...credicoop, fromClientCode: "DG99-3026" }], "2026-11-10")[1][6]).toBe("DG99-3026");
    expect(urbanoUploadFileName("2026-11-10", "Credicoop", "1247")).toBe("PASAJE 10 NOVIEMBRE CREDICOOP 1247.xlsx");
  });

  it("la solicitud para el correo se puede volver a leer como solicitud", () => {
    const [row] = parseSolicitudSheet(requestSheet([pasaje]));
    expect(row).toMatchObject({
      requestDate: "2026-11-12", fromShipper: "1258", fromClientCode: "DG99-3026", fromQuantity: 14,
      toShipper: "1955", toClientCode: "PROD-3026", toQuantity: 14, toDescription: "Pava eléctrica Peabody",
    });
  });
});
