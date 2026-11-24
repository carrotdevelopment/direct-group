import type * as XlsxModule from "xlsx";
import { decodeTxt } from "@/lib/credicoop-txt";
import { locateEgressData } from "@/lib/egress-file-layout";

// Algunos clientes (Massalin) mandan un ".xls" que es una página web. Se le sacan los comentarios antes de
// leerlo: si no, se llevan puesta la fila de títulos.
export function readEgressWorkbook(XLSX: typeof XlsxModule, buffer: ArrayBuffer) {
  const start = new TextDecoder("latin1").decode(buffer.slice(0, 1024)).replace(/^ï»¿/, "").trimStart();
  if (!/^<(!doctype html|html|head|body|table|meta)\b/i.test(start)) return XLSX.read(buffer, { type: "array" });
  return XLSX.read(decodeTxt(buffer).replace(/<!--[\s\S]*?-->/g, ""), { type: "string" });
}

// La primera pestaña que tiene los títulos del cliente y datos abajo; si ninguna los tiene, la primera.
export function egressSheetIndex(sheets: unknown[][][], columns: string[]) {
  return Math.max(0, sheets.findIndex((rows) => {
    const layout = locateEgressData(rows, columns, 0);
    return layout.headerFound && rows.slice(layout.dataStart).some((row) => row.some((cell) => String(cell ?? "").trim()));
  }));
}
