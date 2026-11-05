import { describe, expect, it } from "vitest";
import { egressExportFileName, egressExportSheet } from "@/lib/egress-history-export";

const row = {
  cliente: "Pampa",
  tipoLabel: "Pasaje",
  codigo: "76-5030",
  desc: "Mochila",
  cant: "5",
  raw: { "ID egreso": "12", Destino: "Umiles" },
};

describe("exportación del historial de egresos", () => {
  it("respeta las columnas visibles, su orden y sus títulos", () => {
    const sheet = egressExportSheet([row], [
      { key: "tipo", label: "Tipo" },
      { key: "cant", label: "Cantidad" },
      { key: "ID egreso", label: "ID egreso" },
      { key: "Destino", label: "Destino" },
      { key: "No existe", label: "No existe" },
    ]);
    expect(sheet).toEqual([
      ["Tipo", "Cantidad", "ID egreso", "Destino", "No existe"],
      ["Pasaje", 5, "12", "Umiles", ""],
    ]);
  });

  it("la cantidad sale como número, y como texto si no lo es", () => {
    const columns = [{ key: "cant", label: "Cantidad" }];
    expect(egressExportSheet([{ ...row, cant: "abc" }], columns)[1]).toEqual(["abc"]);
    expect(egressExportSheet([{ ...row, cant: "" }], columns)[1]).toEqual([""]);
  });

  it("arma el nombre del archivo con el cliente y las fechas", () => {
    expect(egressExportFileName("Banco Macro / DG", "2026-10-01", "2026-10-31")).toBe("egresos-Banco-Macro-DG-2026-10-01-a-2026-10-31.xlsx");
  });
});
