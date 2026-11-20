import ExcelJS from "exceljs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  buildProductProposalWorkbook,
  proposalFileName,
  sortProposalRows,
} from "@/lib/product-proposal-excel";

async function sampleImage() {
  const buffer = await sharp({
    create: { width: 40, height: 20, channels: 3, background: "#ff0000" },
  }).jpeg().toBuffer();
  return { buffer, extension: "jpeg" as const, width: 40, height: 20 };
}

describe("propuesta de productos", () => {
  it("arma la hoja con el formato de Pampa: encabezados, NUEVO, precio y foto", async () => {
    const buffer = await buildProductProposalWorkbook({
      client: "PAMPA",
      title: "Mes de la Madre",
      validity: "Octubre",
      rows: [
        {
          clientCode: "",
          category: "AIRE LIBRE",
          product: "Mochila",
          model: "60230",
          brand: "Reebok",
          price: 68850,
          description: "Tiras regulables",
          image: await sampleImage(),
        },
        {
          clientCode: "PA-123",
          category: "HOGAR",
          product: "Alhajero",
          model: "9631",
          brand: "Gorsh",
          price: 35036.5,
          description: "",
          image: null,
        },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    expect(sheet.name).toBe("MES DE LA MADRE");
    expect(sheet.getCell("C2").value).toBe("Propuesta de Productos PAMPA - Mes de la Madre");
    expect(sheet.getCell("C3").value).toBe("Vigencia: Octubre");
    expect(sheet.getRow(5).values).toEqual([
      undefined, "CÓDIGO", "Categoría", "Producto", "Modelo", "Marca", "PVB", "Descripción", "Imagen",
    ]);
    expect(sheet.getCell("A6").value).toBe("NUEVO");
    expect(sheet.getCell("F6").value).toBe(68850);
    expect(sheet.getCell("A7").value).toBe("PA-123");
    expect(sheet.getCell("F7").value).toBe(35036.5);
    expect(sheet.getRow(6).height).toBeCloseTo(176.4);
    const images = sheet.getImages();
    expect(images).toHaveLength(1);
    expect(Math.floor(images[0].range.tl.nativeRow)).toBe(5);
    expect(Math.floor(images[0].range.tl.nativeCol)).toBe(7);
  });

  it("ordena por categoría y producto, y arma el nombre del archivo", () => {
    const sorted = sortProposalRows([
      { category: "HOGAR", product: "B" },
      { category: "Aire libre", product: "Z" },
      { category: "HOGAR", product: "a" },
    ]);
    expect(sorted.map((row) => `${row.category}/${row.product}`)).toEqual(["Aire libre/Z", "HOGAR/a", "HOGAR/B"]);
    expect(proposalFileName("PAMPA", "Mes de la Madre")).toBe("Propuesta de Productos PAMPA - Mes de la Madre.xlsx");
    expect(proposalFileName("A/B", "")).toBe("Propuesta de Productos A B.xlsx");
  });
});
