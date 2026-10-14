import { describe, expect, it } from "vitest";
import { locateEgressData } from "@/lib/egress-file-layout";

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
