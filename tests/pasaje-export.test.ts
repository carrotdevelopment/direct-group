import { describe, expect, it } from "vitest";
import {
  certificate, certificateBase, certificatePrefix, nextCertificateNumber, excelSerial, requestFileName, urbanoIdSheet, urbanoTemplate, urbanoTemplateFileName, urbanoTemplateSheet,
  urbanoUploadFileName, urbanoUploadSheet, type ExportPasaje,
} from "@/lib/pasaje-export";

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

  it("la solicitud lleva el nombre del archivo que se manda hoy", () => {
    expect(requestFileName("2026-10-29")).toBe("Solicitud de pasaje de stock URBANO DIRECT GROUP JUEVES 29102026.xlsx");
    expect(requestFileName("2026-11-09")).toBe("Solicitud de pasaje de stock URBANO DIRECT GROUP LUNES 09112026.xlsx");
  });

  // Filas copiadas de los Excel de pasajes del 24/09/2026 (uno por shipper).
  describe("planilla propia de cada shipper", () => {
    const from = (fromShipper: string, fromClient: string, fromClientCode: string, fromDescription: string, quantity: number): ExportPasaje => ({
      ...pasaje, requestDate: "2026-09-24", fromShipper, fromClient, fromClientCode, fromDescription, quantity,
    });
    const day = excelSerial("2026-09-24");

    it("Massalin", () => {
      const sheet = urbanoTemplateSheet(urbanoTemplate("1369")!, [from("1369", "Massalin", "REC-1301", "Centrifugador de verduras Hudson (CENTRI01) Blanco", 1)], "2026-09-24");
      expect(sheet[1].slice(0, 12)).toEqual([
        "Centrifugador de verduras Hudson (CENTRI01) Blanco", "REC-1301", "PAS2409MASS1", "PASAJE DE STOCK MASSALIN", "PASAJE DE STOCK MASSALIN",
        "ASCASUBI 3380", "", "CABA", 9996, "", "E", 1,
      ]);
      expect(urbanoTemplateFileName("2026-09-24", "Massalin", "1369")).toBe("PASAJE 24 SEPTIEMBRE MASSA 1369.xlsx");
    });

    it("Pampa, con la fecha y la numeración del día", () => {
      const sheet = urbanoTemplateSheet(urbanoTemplate("1315")!, [from("1315", "Pampa", "68-5218", "COOLER 25 L D55D41 AZUL", 12)], "2026-09-24", 3);
      expect(sheet[1]).toEqual([
        day, "", "PAS2409PAMPA3", "COOLER 25 L D55D41 AZUL", "68-5218", "", "", "", "", "", "PASAJE DE STOCK PAMPA", "Buenos Aires ", "",
        "ASCASUBI 3381", "", "BARRACAS", "BSAS", 9996, "", "", "E", 12,
      ]);
    });

    it("Producteca: 56 columnas con SKU, cantidad y dirección en su lugar", () => {
      const sheet = urbanoTemplateSheet(urbanoTemplate("1955")!, [from("1955", "Producteca", "PROD-164", "", 23)], "2026-09-24");
      expect(sheet[0]).toHaveLength(56);
      expect([sheet[1][0], sheet[1][1], sheet[1][3], sheet[1][11], sheet[1][15], sheet[1][29], sheet[1][32]]).toEqual([
        day, "PAS2409PR1", "PASAJE DE STOCK", "PROD-164", 23, "ASCASUBI 3380", 9996,
      ]);
      expect(urbanoTemplateFileName("2026-09-24", "Producteca", "1955")).toBe("PASAJE 24 SEPTIEMBRE PR 1955.xlsx");
    });

    it("Syngenta lleva la descripción bajo Código y el código bajo Producto, como su planilla", () => {
      const row = urbanoTemplateSheet(urbanoTemplate("3817")!, [from("3817", "Syngenta", "SYN115", "TIJERA CORTACERCO 5943", 13)], "2026-09-24")[1];
      expect(row.slice(0, 17)).toEqual([
        "PAS2409SYN1", "PAS2409SYN1", "PAS2409SYN1", "ASCASUBI 3380", "", "BARRACAS", "BSAS", "", 9996, "", "", "",
        "TIJERA CORTACERCO 5943", "SYN115", 13, day, "E",
      ]);
    });

    it("Umiles usa PJE en el ID", () => {
      const row = urbanoTemplateSheet(urbanoTemplate("3102")!, [from("3102", "Umiles", "URB-179", "", 10)], "2026-09-24")[1];
      expect([row[4], row[6], row[8], row[12], row[20]]).toEqual(["PJE2409UMILES1", 10, "URB-179", "PASAJE DE STOCK", "E"]);
    });

    it("un shipper sin planilla cargada no tiene formato propio", () => {
      expect(urbanoTemplate("9999")).toBeNull();
    });
  });

  describe("ID de cada pasaje en Urbano", () => {
    it("toma el siguiente número libre de su base y no confunde bases parecidas", () => {
      const taken = ["PAS2409PAMPA1", "PAS2409PAMPA2", "PAS2409PAMPA7", "PAS2409PAMPAX", "PAS2409PR3", "PAS2409PRODUCTECA9"];
      expect(nextCertificateNumber("PAS2409PAMPA", taken)).toBe(8);
      expect(nextCertificateNumber("PAS2409PR", taken)).toBe(4);
      expect(nextCertificateNumber("PAS2409AMEX", taken)).toBe(1);
    });

    it("la base lleva el prefijo del shipper", () => {
      expect(certificateBase("2026-09-24", "Umiles", certificatePrefix("3102"))).toBe("PJE2409UMILES");
      expect(certificateBase("2026-09-24", "Credicoop", certificatePrefix("1247"))).toBe("PAS2409CREDI");
    });

    it("un pasaje que ya tiene ID sale siempre con ese ID", () => {
      const withId = { ...pasaje, certificate: "PAS1211AMEX5" };
      expect(urbanoUploadSheet([withId], "2026-11-12")[1][3]).toBe("PAS1211AMEX5");
      expect(urbanoIdSheet([withId], "2026-11-12")[1][0]).toBe("PAS1211AMEX5");
      expect(urbanoTemplateSheet(urbanoTemplate("1258")!, [withId], "2026-11-12")[1][3]).toBe("PAS1211AMEX5");
    });
  });
});
