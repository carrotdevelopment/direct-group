import { describe, expect, it } from "vitest";
import { credicoopTxtRows, decodeTxt, isTxtFile } from "@/lib/credicoop-txt";
import { locateEgressData } from "@/lib/egress-file-layout";
import { canonicalizeEgressRecord, defaultEgressProfiles } from "@/lib/generic-egress-db";

const line = (over: Partial<Record<number, string>> = {}) =>
  ["900001", "PEREZ              ANA   ", "calle 1 null null", "2520", "Santa Fe", "las rosas ", "18379", "1", "749750", "20261120", "Juego de toalla", "", "111", "null", "3497"]
    .map((value, index) => over[index] ?? value).join(";");
const file = (...lines: string[]) => [`013985.${String(lines.length).padStart(9, "0")}.20261121`, ...lines, ""].join("\r\n");

describe("TXT de canjes de Credicoop", () => {
  it("llega a un egreso con el código del producto, la fecha del canje y una unidad", () => {
    const rows = credicoopTxtRows(file(line(), line({ 0: "900002", 14: "4837" })));
    const profile = defaultEgressProfiles().find((item) => item.client === "Credicoop")!;
    const layout = locateEgressData(rows, profile.columns, 2);
    expect(layout).toMatchObject({ headerFound: true, dataStart: 1 });
    const record = Object.fromEntries(rows[0].map((name, index) => [name, rows[1][index]]));
    expect(record).toMatchObject({ IdRedencion: "900001", Localidad: "las rosas", Provincia: "Santa Fe", Telefono2: "" });
    const egress = canonicalizeEgressRecord({ ...record, Operación: "CANJE" }, profile.mapping);
    expect(egress).toMatchObject({ clientCode: "3497", quantity: 1, operation: "CANJE", product: "Juego de toalla" });
    expect(egress.date?.toISOString().slice(0, 10)).toBe("2026-11-20");
    expect(rows).toHaveLength(3);
  });

  it("no lee un archivo incompleto, sin la primera línea o con datos que no cierran", () => {
    expect(() => credicoopTxtRows(file(line(), line()).replace("000000002", "000000003"))).toThrow("dice que trae 3 canjes pero tiene 2");
    expect(() => credicoopTxtRows(line())).toThrow("primera línea");
    expect(() => credicoopTxtRows("")).toThrow("primera línea");
    expect(() => credicoopTxtRows(file(line({ 2: "calle; 1" })))).toThrow("Línea 2: tiene 16 datos");
    expect(() => credicoopTxtRows(file(line({ 9: "20261131" })))).toThrow("la fecha");
    expect(() => credicoopTxtRows(file(line({ 14: "" })))).toThrow("falta");
    expect(() => credicoopTxtRows(file(line({ 7: "3" })))).toThrow("estado");
  });

  it("lee UTF-8 y el formato de Windows", () => {
    expect(decodeTxt(new TextEncoder().encode("ESPAÑOL").buffer as ArrayBuffer)).toBe("ESPAÑOL");
    expect(decodeTxt(Uint8Array.from([0x45, 0xd1]).buffer)).toBe("EÑ");
    expect([isTxtFile("SOLIC_191.TXT"), isTxtFile("a.xlsx")]).toEqual([true, false]);
  });
});
