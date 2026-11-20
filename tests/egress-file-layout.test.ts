import { describe, expect, it } from "vitest";
import { locateEgressData, repairMojibake, slashDate } from "@/lib/egress-file-layout";

const columns = ["Producto", "Código Producto", "Nº Seg", "Usuario", "Email", "Fecha Canje"];

describe("ubicación de los datos en un archivo de egresos", () => {
  it("con los títulos en la primera fila, lee desde la segunda aunque la fila de inicio diga 2", () => {
    const rows = [
      ["Producto", "Código Producto", "Nº Seg", "Usuario", "Email", "Fecha Canje", "Estado"],
      ["Mate", "URB-386", 5108, "JOSE", "a@b.com", 46308, "Processed"],
      ["Drone", "URB-339", 5107, "JOSE", "a@b.com", 46308, "Processed"],
    ];
    const layout = locateEgressData(rows, columns, 2);
    expect(layout).toMatchObject({ headerFound: true, headerIndex: 0, dataStart: 1 });
    expect(rows[layout.dataStart][layout.positions[1]]).toBe("URB-386");
  });

  it("con un título arriba, encuentra los encabezados en la segunda fila", () => {
    const rows = [["Canjes Umiles octubre"], ["Producto", "Código Producto", "Nº Seg", "Usuario", "Email", "Fecha Canje"], ["Mate", "URB-386"]];
    expect(locateEgressData(rows, columns, 0)).toMatchObject({ headerFound: true, headerIndex: 1, dataStart: 2 });
  });

  it("lee cada columna por su título aunque el archivo traiga otro orden, mayúsculas o columnas de más", () => {
    const rows = [
      ["Estado", "FECHA CANJE", "Código  Producto", "Producto", "Columna nueva", "Nº Seg", "Usuario", "Email"],
      ["Processed", 46308, "URB-386", "Mate", "x", 5108, "JOSE", "a@b.com"],
    ];
    const { positions, dataStart } = locateEgressData(rows, columns, 2);
    const read = (name: string) => rows[dataStart][positions[columns.indexOf(name)]];
    expect(read("Código Producto")).toBe("URB-386");
    expect(read("Fecha Canje")).toBe(46308);
    expect(read("Producto")).toBe("Mate");
  });

  it("sin títulos reconocibles usa la fila de inicio configurada y lee por posición", () => {
    const rows = [["a", "b"], ["c", "d"], ["Mate", "URB-386"]];
    expect(locateEgressData(rows, columns, 2)).toEqual({ headerFound: false, headerIndex: 1, dataStart: 2, positions: [0, 1, 2, 3, 4, 5] });
  });

  it("una fila de datos que repite un valor de columna no se toma como encabezado", () => {
    const rows = [["Producto", "Código Producto", "Nº Seg", "Usuario", "Email", "Fecha Canje"], ["Producto", "URB-1", 1, "U", "e", 46308]];
    expect(locateEgressData(rows, columns, 2).headerIndex).toBe(0);
  });
});

describe("acentos rotos en el Excel del cliente", () => {
  it("recompone el texto UTF-8 que llegó leído como Latin-1", () => {
    expect(repairMojibake("JUEGO DE SÃ\u0081BANAS -QUEEN- 2 Â½ PLAZAS")).toBe("JUEGO DE SÁBANAS -QUEEN- 2 ½ PLAZAS");
    expect(repairMojibake("SET X 2 ALMOHADAS VELLÃ“N SILICONADO")).toBe("SET X 2 ALMOHADAS VELLÓN SILICONADO");
    expect(repairMojibake("NÂº Seguimiento")).toBe("Nº Seguimiento");
  });
  it("deja igual el texto que ya está bien", () => {
    expect(repairMojibake("Sábanas de algodón")).toBe("Sábanas de algodón");
    expect(repairMojibake("HUMIFICADOR")).toBe("HUMIFICADOR");
  });
});

describe("fechas con barras del Excel del cliente", () => {
  it("lee día/mes, lo habitual", () => {
    expect(slashDate("05/11/2026")?.iso).toBe("2026-11-05");
    expect(slashDate("18/11/26")?.iso).toBe("2026-11-18");
  });
  it("lee mes/día cuando viene con el formato de EE.UU.", () => {
    expect(slashDate("11/18/2026 8:25:00 PM")?.iso).toBe("2026-11-18");
    expect(slashDate("11/05/2026 10:08:00 AM")?.iso).toBe("2026-11-05");
  });
  it("no inventa fechas imposibles", () => {
    expect(slashDate("31/02/2026")).toBeNull();
  });
});
