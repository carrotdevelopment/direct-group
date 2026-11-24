import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { egressSheetIndex, readEgressWorkbook } from "@/lib/egress-workbook";
import { locateEgressData } from "@/lib/egress-file-layout";
import { canonicalizeEgressRecord, defaultEgressProfiles, latestUniqueCodes } from "@/lib/generic-egress-db";

const COLS = ["Descripcion", "Codigo", "NÂº Seguimiento", "Cantidad", "Fecha"];
const row = (...cells: string[]) => `<tr>${cells.map((cell) => `<th>${cell}\t\t</th>`).join("\n")}</tr>`;
const html = `\n<html>\n<body>\n<table>${row("", "Proceso", "Nº: 1")}</table>
<table>\n<tr style="x">\n<!-- <th>Descripcion</th>\n<th>Codigo</th>\n<th>Otro</th>-->\n<th>Descripcion</th><th>Codigo</th><th>Nº Seguimiento</th><th>Cantidad</th><th>Fecha</th></tr>
${row("Pava", "REC-1", "100", "1", "2026-11-20 10:29:25")}${row("Ñandú", "REC-2", "101", "1", "2026-11-23 23:10:00")}</table>
<table>${row("Descripcion", "Codigo", "Nº Seg", "Cantidad", "Fecha")}</table></body></html>`;
const grids = (buffer: ArrayBuffer) => {
  const book = readEgressWorkbook(XLSX, buffer);
  return book.SheetNames.map((name) => XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, defval: "" }));
};

describe("archivos de egresos", () => {
  it("lee el .xls de Massalin que es una página web, sin perder canjes ni títulos", () => {
    const sheets = grids(new TextEncoder().encode(html).buffer as ArrayBuffer);
    expect(egressSheetIndex(sheets, COLS)).toBe(1);
    const layout = locateEgressData(sheets[1], COLS, 2);
    expect([layout.headerFound, layout.dataStart, sheets[1].length]).toEqual([true, 1, 3]);
    const record = Object.fromEntries(COLS.map((name, index) => [name, String(sheets[1][2][layout.positions[index]])]));
    const mapping = { ...defaultEgressProfiles().find((item) => item.client === "Massalin")!.mapping, clientCode: ["Codigo"], date: ["Fecha"] };
    const egress = canonicalizeEgressRecord({ ...record, Operación: "CANJE" }, mapping);
    expect(egress).toMatchObject({ clientCode: "REC-2", product: "Ñandú", quantity: 1 });
    expect(egress.date?.toISOString().slice(0, 10)).toBe("2026-11-23");
  });

  it("un Excel común sigue leyéndose por la primera pestaña", () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["a", "b"], ["1", "2"]]), "Uno");
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["c"]]), "Dos");
    const sheets = grids(XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    expect([sheets.length, sheets[0][1], egressSheetIndex(sheets, COLS)]).toEqual([2, ["1", "2"], 0]);
  });

  it("si el código no está activo usa el último que tuvo, y el activo manda", () => {
    const map = latestUniqueCodes([
      { clientCode: "REC-1", uniqueCode: "viejo", active: false },
      { clientCode: "rec-1 ", uniqueCode: "activo", active: true },
      { clientCode: "REC-2", uniqueCode: "ultimo", active: false },
      { clientCode: "REC-2", uniqueCode: "anterior", active: false },
    ]);
    expect([map.get("rec-1"), map.get("rec-2")]).toEqual(["activo", "ultimo"]);
  });
});
