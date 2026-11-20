import ExcelJS from "exceljs";

// Propuesta de productos para un cliente (formato de la que se le envía a Banco de la Pampa):
// una fila por producto con código, categoría, producto, modelo, marca, precio, descripción y foto.

export type ProposalImage = {
  buffer: Buffer;
  extension: "png" | "jpeg";
  width: number;
  height: number;
};

export type ProposalRow = {
  clientCode: string;
  category: string;
  product: string;
  model: string;
  brand: string;
  price: number;
  description: string;
  image?: ProposalImage | null;
};

export type ProposalInput = {
  client: string;
  title: string;
  validity: string;
  rows: ProposalRow[];
};

const HEADERS = ["CÓDIGO", "Categoría", "Producto", "Modelo", "Marca", "PVB", "Descripción", "Imagen"];
const WIDTHS = [18, 24.5, 46, 23, 22, 18, 64, 38];
const HEADER_ROW = 5;
const ROW_HEIGHT_PT = 176.4;
const MONEY_FORMAT = '_-"$"\\ * #,##0.00_-;\\-"$"\\ * #,##0.00_-;_-"$"\\ * "-"??_-;_-@_-';

const YELLOW = "FFFFFF00";
const LIGHT_YELLOW = "FFFFFF99";
const HEADER_BLUE = "FFDDEBF7";

// Ancho de columna en caracteres → píxeles (Calibri 11, como Excel).
function columnPixels(width: number) {
  return Math.floor(width * 7 + 5);
}

function fill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFBFBFBF" } },
  left: { style: "thin", color: { argb: "FFBFBFBF" } },
  bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
  right: { style: "thin", color: { argb: "FFBFBFBF" } },
};

export function proposalFileName(client: string, title: string) {
  const name = `Propuesta de Productos ${client.trim()}${title.trim() ? ` - ${title.trim()}` : ""}`;
  return `${name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()}.xlsx`;
}

export function sortProposalRows<T extends { category: string; product: string }>(rows: T[]) {
  return [...rows].sort(
    (a, b) =>
      a.category.localeCompare(b.category, "es", { sensitivity: "base" }) ||
      a.product.localeCompare(b.product, "es", { sensitivity: "base" }),
  );
}

export async function buildProductProposalWorkbook(input: ProposalInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Direct Group";
  const sheetName = (input.title.trim() || "Propuesta").replace(/[\\/?*[\]:]/g, " ").slice(0, 31).toUpperCase();
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: HEADER_ROW, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  });
  sheet.columns = WIDTHS.map((width) => ({ width }));

  sheet.mergeCells("C2:E2");
  const title = sheet.getCell("C2");
  title.value = `Propuesta de Productos ${input.client.trim()}${input.title.trim() ? ` - ${input.title.trim()}` : ""}`;
  title.font = { bold: true, size: 14, color: { argb: "FF10233F" } };
  const validity = sheet.getCell("C3");
  validity.value = `Vigencia: ${input.validity.trim()}`;
  validity.font = { bold: true, size: 11 };
  sheet.getCell("F3").value = "Precios con IVA incluido";
  sheet.getCell("F3").font = { italic: true, size: 10, color: { argb: "FF5A6A82" } };

  const header = sheet.getRow(HEADER_ROW);
  header.values = HEADERS;
  header.height = 22;
  header.eachCell((cell, col) => {
    cell.font = { bold: true, size: 11 };
    cell.fill = fill(col === 1 || col === 6 ? YELLOW : HEADER_BLUE);
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = THIN;
  });

  const imageColPx = columnPixels(WIDTHS[7]);
  const rowPx = (ROW_HEIGHT_PT * 96) / 72;
  const pad = 8;

  input.rows.forEach((item, index) => {
    const rowNumber = HEADER_ROW + 1 + index;
    const row = sheet.getRow(rowNumber);
    row.values = [
      item.clientCode.trim() || "NUEVO",
      item.category,
      item.product,
      item.model,
      item.brand,
      item.price,
      item.description,
      "",
    ];
    row.height = ROW_HEIGHT_PT;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.alignment = {
        vertical: "middle",
        horizontal: col === 7 ? "left" : "center",
        wrapText: true,
      };
      cell.border = THIN;
      cell.font = { size: 11 };
      if (col === 1 || col === 6) {
        cell.fill = fill(LIGHT_YELLOW);
        cell.font = { size: 11, bold: true };
      }
      if (col === 7) cell.font = { size: 10 };
    });
    row.getCell(6).numFmt = MONEY_FORMAT;

    const image = item.image;
    if (image && image.width > 0 && image.height > 0) {
      const scale = Math.min((imageColPx - pad * 2) / image.width, (rowPx - pad * 2) / image.height);
      const width = Math.round(image.width * scale);
      const height = Math.round(image.height * scale);
      const imageId = workbook.addImage({ buffer: image.buffer as unknown as ExcelJS.Buffer, extension: image.extension });
      // Centrado en la celda: el ancla usa fracciones de columna/fila (base 0).
      sheet.addImage(imageId, {
        tl: {
          col: 7 + (imageColPx - width) / 2 / imageColPx,
          row: rowNumber - 1 + (rowPx - height) / 2 / rowPx,
        } as ExcelJS.Anchor,
        ext: { width, height },
        editAs: "oneCell",
      });
    }
  });

  if (input.rows.length > 0) {
    sheet.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: 7 } };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
