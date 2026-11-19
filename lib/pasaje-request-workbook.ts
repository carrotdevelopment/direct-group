// Solicitud de pasaje de stock para Urbano con el formato exacto que se usa hoy (logo de Urbano, título,
// fecha en amarillo, bloques ORIGEN y DESTINO, totales, AUTORIZA / Direct Group y la hoja SH de shippers).
// Se parte de la planilla original guardada en templates/solicitud-pasaje-urbano.xlsx (convertida
// del .xls que mandaron, sin las filas de ejemplo) y solo se agregan las filas de la solicitud: así se
// conservan tal cual el logo, las fuentes, los bordes, los anchos y la configuración de impresión.
import * as XLSX from "xlsx";
import { excelSerial, type DraftRequestRow } from "@/lib/pasaje-export";

// La plantilla vive en templates/ (no es pública) y la lee el servidor.
export const REQUEST_TEMPLATE_FILE = "templates/solicitud-pasaje-urbano.xlsx";

export type RequestWorkbookRow = DraftRequestRow;

// Estilos de la planilla original (índices de xl/styles.xml) para cada columna de las filas.
const STYLE = { date: 4, number: 5, code: 7, description: 23, totalLabel: 6, autoriza: 27, signature: 8, below: 2 };
const FIRST_ROW = 10; // Las filas empiezan debajo de los títulos (fila 9), como en el original.

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    // Caracteres de control que Excel no acepta.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

function cell(ref: string, style: number, value: unknown, kind: "auto" | "text" = "auto") {
  if (value === null || value === undefined || value === "") return `<c r="${ref}" s="${style}"/>`;
  const asNumber = typeof value === "number" ? value : kind === "auto" && /^\d+$/.test(String(value).trim()) ? Number(value) : null;
  if (asNumber !== null && Number.isFinite(asNumber)) return `<c r="${ref}" s="${style}"><v>${asNumber}</v></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
}

const formula = (ref: string, style: number, expression: string, value: number) =>
  `<c r="${ref}" s="${style}"><f>${expression}</f><v>${value}</v></c>`;

// Filas de la hoja 1 a partir de la fila 10: los pasajes, los totales y el pie AUTORIZA / Direct Group,
// separados como en el original (una fila libre antes del total y tres antes de AUTORIZA).
export function requestRowsXml(rows: RequestWorkbookRow[], fallbackDate: string) {
  const lines = rows.length ? rows : [null];
  const last = FIRST_ROW + lines.length - 1;
  const xml: string[] = [];
  let fromTotal = 0;
  let toTotal = 0;
  lines.forEach((row, index) => {
    const r = FIRST_ROW + index;
    const fromQuantity = row ? row.fromQuantity ?? row.toQuantity : null;
    const toQuantity = row ? row.toQuantity ?? row.fromQuantity : null;
    fromTotal += fromQuantity ?? 0;
    toTotal += toQuantity ?? 0;
    xml.push(
      `<row r="${r}" spans="1:12" ht="14.5" x14ac:dyDescent="0.35">` +
        cell(`A${r}`, STYLE.date, row ? excelSerial(row.requestDate || fallbackDate) : null) +
        cell(`B${r}`, STYLE.number, row?.fromShipper) +
        cell(`C${r}`, STYLE.code, row?.fromClientCode, "text") +
        cell(`D${r}`, STYLE.description, row?.fromDescription, "text") +
        cell(`E${r}`, STYLE.number, fromQuantity) +
        cell(`G${r}`, STYLE.number, row?.toShipper) +
        cell(`H${r}`, STYLE.code, row?.toClientCode, "text") +
        cell(`I${r}`, STYLE.description, row?.toDescription, "text") +
        cell(`J${r}`, STYLE.number, toQuantity) +
        "</row>",
    );
  });
  const total = last + 2;
  const autoriza = last + 6;
  xml.push(
    `<row r="${total}" spans="1:10" x14ac:dyDescent="0.25">` +
      cell(`D${total}`, STYLE.totalLabel, "TOTAL  ORIGEN", "text") +
      formula(`E${total}`, STYLE.number, `SUM(E${FIRST_ROW}:E${last + 1})`, fromTotal) +
      cell(`I${total}`, STYLE.number, "TOTAL DESTINO", "text") +
      formula(`J${total}`, STYLE.number, `SUM(J${FIRST_ROW}:J${last + 1})`, toTotal) +
      "</row>",
    `<row r="${autoriza}" spans="4:4" x14ac:dyDescent="0.25">${cell(`D${autoriza}`, STYLE.autoriza, "AUTORIZA", "text")}</row>`,
    `<row r="${autoriza + 1}" spans="4:4" x14ac:dyDescent="0.25">${cell(`D${autoriza + 1}`, STYLE.autoriza, null)}</row>`,
    `<row r="${autoriza + 2}" spans="4:4" x14ac:dyDescent="0.25">${cell(`D${autoriza + 2}`, STYLE.signature, "Direct Group", "text")}</row>`,
    `<row r="${autoriza + 3}" spans="4:4" x14ac:dyDescent="0.25">${cell(`D${autoriza + 3}`, STYLE.below, null)}</row>`,
  );
  return { xml: xml.join(""), last, autoriza, end: autoriza + 3 };
}

type CfbContainer = ReturnType<typeof XLSX.CFB.read>;

function readText(cfb: CfbContainer, path: string) {
  const entry = XLSX.CFB.find(cfb, path);
  if (!entry?.content) throw new Error(`La plantilla de la solicitud no tiene ${path}.`);
  return { entry, text: new TextDecoder().decode(entry.content as Uint8Array) };
}

function writeText(entry: { content: unknown; size?: number }, text: string) {
  const bytes = new TextEncoder().encode(text);
  entry.content = bytes;
  entry.size = bytes.length;
}

// Arma el .xlsx: la plantilla con la fecha de la solicitud (D5) y las filas de los pasajes.
export function buildRequestWorkbook(template: Uint8Array, rows: RequestWorkbookRow[], requestDate: string): Uint8Array {
  const cfb = XLSX.CFB.read(template, { type: "array" });
  const sheet = readText(cfb, "/xl/worksheets/sheet1.xml");
  const { xml, last, autoriza, end } = requestRowsXml(rows, requestDate);
  let text = sheet.text
    .replace(/<c r="D5" s="(\d+)"><v>[^<]*<\/v><\/c>/, `<c r="D5" s="$1"><v>${excelSerial(requestDate)}</v></c>`)
    .replace("</sheetData>", `${xml}</sheetData>`)
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A3:L${end}"/>`)
    .replace(/<autoFilter ref="[^"]*"/, `<autoFilter ref="A9:L${last}"`)
    .replace(/<mergeCells count="(\d+)">([\s\S]*?)<\/mergeCells>/, (_match, count: string, merges: string) =>
      `<mergeCells count="${Number(count) + 1}">${merges}<mergeCell ref="D${autoriza}:D${autoriza + 1}"/></mergeCells>`);
  if (!text.includes(`<c r="D5"`)) throw new Error("La plantilla de la solicitud no tiene la celda de la fecha.");
  writeText(sheet.entry, text);

  const workbook = readText(cfb, "/xl/workbook.xml");
  text = workbook.text.replace(/(Hoja1!\$A\$9:\$L\$)\d+/, `$1${last}`);
  writeText(workbook.entry, text);

  const out = XLSX.CFB.write(cfb, { fileType: "zip", type: "array" }) as ArrayLike<number> | ArrayBuffer;
  return out instanceof ArrayBuffer ? new Uint8Array(out) : Uint8Array.from(out as ArrayLike<number>);
}
