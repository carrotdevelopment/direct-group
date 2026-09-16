export type ClientPriceExportRow = {
  clientCode: string;
  uniqueCode: string;
  product: string;
  category: string;
  priceWithVat: number;
  validity: string;
};

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN = 30;
const ROW_HEIGHT = 20;
const COLUMNS = [
  { label: "Codigo cliente", width: 86, align: "left" },
  { label: "Codigo unico", width: 92, align: "left" },
  { label: "Producto", width: 252, align: "left" },
  { label: "Categoria", width: 122, align: "left" },
  { label: "Precio c/IVA", width: 112, align: "right" },
  { label: "Vigencia", width: 86, align: "center" },
] as const;

function pdfText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function shorten(value: string, maxChars: number) {
  const normalized = pdfText(value).trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function money(value: number) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function textCommand(
  value: string,
  x: number,
  y: number,
  options: { size?: number; bold?: boolean; color?: string } = {},
) {
  const size = options.size ?? 9;
  const font = options.bold ? "/F2" : "/F1";
  const color = options.color ?? "0.102 0.212 0.373";
  return `BT ${color} rg ${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfText(value)}) Tj ET`;
}

function pageContent(
  client: string,
  validity: string,
  rows: ClientPriceExportRow[],
  pageNumber: number,
  pageCount: number,
) {
  const commands: string[] = [];
  commands.push("0.043 0.357 0.733 rg 0 0 842 595 re f");
  commands.push("1 1 1 rg 0 0 842 492 re f");
  commands.push(textCommand("LISTA DE PRECIOS", MARGIN, 555, { size: 18, bold: true, color: "1 1 1" }));
  commands.push(textCommand(client, MARGIN, 535, { size: 11, bold: true, color: "1 1 1" }));
  commands.push(textCommand(`Vigencia: ${validity}`, 650, 544, { size: 10, color: "1 1 1" }));

  let x = MARGIN;
  const headerY = 482;
  for (const column of COLUMNS) {
    commands.push(`0.867 0.918 0.973 rg ${x} ${headerY} ${column.width} ${ROW_HEIGHT} re f`);
    commands.push(textCommand(column.label, x + 5, headerY + 7, { size: 8, bold: true }));
    x += column.width;
  }

  rows.forEach((row, index) => {
    const y = headerY - (index + 1) * ROW_HEIGHT;
    if (index % 2 === 1) commands.push(`0.969 0.980 0.992 rg ${MARGIN} ${y} 750 ${ROW_HEIGHT} re f`);
    const values = [
      shorten(row.clientCode || "-", 15),
      shorten(row.uniqueCode, 17),
      shorten(row.product, 45),
      shorten(row.category || "-", 21),
      `$ ${money(row.priceWithVat)}`,
      row.validity,
    ];
    let cellX = MARGIN;
    values.forEach((value, columnIndex) => {
      const column = COLUMNS[columnIndex];
      const approximateWidth = value.length * 4.4;
      const textX = column.align === "right"
        ? cellX + column.width - approximateWidth - 5
        : column.align === "center"
          ? cellX + (column.width - approximateWidth) / 2
          : cellX + 5;
      commands.push(textCommand(value, Math.max(cellX + 4, textX), y + 7, { size: 8 }));
      cellX += column.width;
    });
    commands.push(`0.878 0.906 0.937 RG ${MARGIN} ${y} 750 0 re S`);
  });

  commands.push(textCommand(
    `Precios expresados con IVA incluido | Pagina ${pageNumber} de ${pageCount}`,
    MARGIN,
    22,
    { size: 8, color: "0.39 0.45 0.54" },
  ));
  return commands.join("\n");
}

export function createClientPricePdf(
  client: string,
  validity: string,
  rows: ClientPriceExportRow[],
) {
  const rowsPerPage = 21;
  const pages = Array.from(
    { length: Math.max(1, Math.ceil(rows.length / rowsPerPage)) },
    (_, index) => rows.slice(index * rowsPerPage, (index + 1) * rowsPerPage),
  );

  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = addObject("");
  const pagesId = addObject("");
  const fontRegularId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const fontBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const pageIds: number[] = [];

  pages.forEach((pageRows, index) => {
    const content = pageContent(client, validity, pageRows, index + 1, pages.length);
    const contentId = addObject(`<< /Length ${new TextEncoder().encode(content).length} >>\nstream\n${content}\nendstream`);
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> ` +
      `/Contents ${contentId} 0 R >>`,
    );
    pageIds.push(pageId);
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((body, index) => {
    offsets.push(new TextEncoder().encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
