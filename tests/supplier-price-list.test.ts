import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { matchSupplierCode, readSupplierPriceList, supplierPriceFormat } from "@/lib/supplier-price-list";

const format = supplierPriceFormat("rayovac")!;

const header = ["CODIGO SAP", "IMAGEN", "Descripción", "", "EAN", "Unid x caja", "Precio de Lista", "Descuento Canal Hogar", "Dto. Acord.", "Precio Factura Sin IVA", "Iva", "", "Precio Público", "Mk- Up"];
const row = (code: string, cost: unknown, vat: unknown, publicPrice: unknown) => [code, "", "Trimmer", "Nano  Series", "0-74", 4, 35836.2, 21718.91, 0, cost, vat, 23999.39, publicPrice, 1.65];

function workbook(rows: unknown[][], hiddenRows?: unknown[][]) {
  const book = XLSX.utils.book_new();
  if (hiddenRows) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(hiddenRows), "vieja");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "REM");
  if (hiddenRows) book.Workbook = { Sheets: [{ Hidden: 1 }, { Hidden: 0 }] };
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("lista de precios de Rayovac", () => {
  it("toma costo, IVA y precio público de sus columnas y saltea títulos y pie", () => {
    const list = readSupplierPriceList(workbook([
      ["LISTA DE PRECIOS JULIO 2026"],
      header,
      ["", "", "", "", "", "", "", "", "%", "$", "%", "$", "$", 1.65],
      ["CORTA CABELLOS"],
      row(" HC1095A-220A", 21718.908542437955, 0.105, 39599),
      row("D1500 (BV) A", 24878.03656398698, 0.21, 49669),
      ["Rayovac Argentina S.R.L. Av del Libertador 6810"],
    ]), format);
    expect(list.rows).toEqual([
      { sourceCode: "HC1095A-220A", description: "Trimmer · Nano Series", costDg: 21718.91, vatRate: 10.5, publicPrice: 39599 },
      { sourceCode: "D1500 (BV) A", description: "Trimmer · Nano Series", costDg: 24878.04, vatRate: 21, publicPrice: 49669 },
    ]);
    expect(list.period).toEqual({ month: 7, year: 2026, label: "julio 2026" });
    expect(list.warnings).toEqual([]);
  });

  it("no lee las hojas ocultas", () => {
    const list = readSupplierPriceList(workbook([header, row("A1", 10, 0.21, 20)], [header, row("B2", 1, 0.21, 2)]), format);
    expect(list.sheets).toEqual(["REM"]);
    expect(list.rows.map((item) => item.sourceCode)).toEqual(["A1"]);
  });

  it("avisa lo incompleto y lo repetido con otro precio", () => {
    const list = readSupplierPriceList(workbook([header, row("A1", 10, 0.21, 20), row("A-1", 11, 0.21, 20), row("B2", "", 0.21, 20), row("C3", "#VALUE!", 0.21, 20)]), format);
    expect(list.rows).toHaveLength(1);
    expect(list.warnings.join(" ")).toContain("B2, C3");
    expect(list.warnings.join(" ")).toContain("A-1");
  });

  it("no inventa nada si el archivo tiene otro formato", () => {
    expect(readSupplierPriceList(workbook([["Codigo", "PVP"], ["A1", 10]]), format).sheets).toEqual([]);
  });
});

describe("cruce de códigos", () => {
  const product = (code: string, supplierCode = "") => ({ code, supplierCode });

  it("el mismo código con otros espacios o signos es exacto", () => {
    expect(matchSupplierCode("HC4050 - 220 A", [product("hc4050 (220) a")])).toMatchObject({ exact: true });
    expect(matchSupplierCode("X9", [product("otro", "x-9")])).toMatchObject({ exact: true });
  });

  it("el mismo modelo con otra terminación queda para confirmar", () => {
    expect(matchSupplierCode("MB20A (BV) A", [product("mb20a(bv")])).toMatchObject({ exact: false, product: { code: "mb20a(bv" } });
  });

  it("prefiere el código igual y no elige entre varios parecidos", () => {
    const combos = [product("d3016gp"), product("d3016gp-220a")];
    expect(matchSupplierCode("D3016GP-220A", combos)).toMatchObject({ exact: true, product: { code: "d3016gp-220a" } });
    expect(matchSupplierCode("D3016GP (BV)", combos)).toBeNull();
    expect(matchSupplierCode("AS8930-220A", [product("a8930-220a")])).toBeNull();
  });
});
