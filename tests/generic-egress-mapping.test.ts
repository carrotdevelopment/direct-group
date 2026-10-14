import { describe, expect, it } from "vitest";
import {
  canonicalizeEgressRecord,
  defaultEgressMappings,
} from "@/lib/generic-egress-db";

describe("mapeo canónico de egresos", () => {
  it("normaliza el formato Santander y resuelve el código único", () => {
    const result = canonicalizeEgressRecord({
      Dia: "4", Mes: "9", Año: "2026", SKU: "DIR116", ID: "Producto original",
      Cantidad: "2", Operación: "ROBO/AJUSTE", Destino: "Depósito", Comentario: "Controlado",
    }, defaultEgressMappings.Santander, {
      resolveUniqueCode: (code) => code === "DIR116" ? "DG-001" : "",
      resolveProduct: (code) => code === "DG-001" ? "Producto maestro" : "",
    });

    expect(result).toMatchObject({
      operation: "ROBO_AJUSTE",
      clientCode: "DIR116",
      uniqueCode: "DG-001",
      product: "Producto maestro",
      quantity: 2,
      destination: "Depósito",
      comments: "Controlado",
    });
    expect(result.date?.toISOString().slice(0, 10)).toBe("2026-09-04");
  });

  it.each([
    ["Amex", { "Codigo cliente": "A1", Descripcion: "Premio", Cantidad: "1" }],
    ["HSBC", { "Código Cliente": "H1", nombre_producto: "Premio", Cantidad: "1" }],
    ["Importados", { "Código Cliente": "I1", PRODUCTO: "Premio", Cantidad: "1" }],
    ["Massalin", { "Código Cliente": "M1", Descripcion: "Premio", Cantidad: "1" }],
    ["Pampa", { SKU: "P1", Descripcion: "Premio", Cantidad: "1" }],
    ["Producteca", { "Código Cliente": "PR1", Descripcion: "Premio", Cantidad: "1" }],
    ["Syngenta", { "Código producto": "S1", Producto: "Premio", Cantidad: "1" }],
    ["Umiles", { "Código Cliente": "U1", PRODUCTO: "Premio", Cantidad: "1" }],
  ] as const)("mapea las columnas principales de %s", (client, row) => {
    const result = canonicalizeEgressRecord(row, defaultEgressMappings[client]);
    expect(result.clientCode).toBeTruthy();
    expect(result.product).toBe("Premio");
    expect(result.quantity).toBe(1);
  });
});

describe("canjes con fecha en una sola columna y sin cantidad", () => {
  const mapping = {
    ...defaultEgressMappings.Umiles,
    dateDay: [], dateMonth: [], dateYear: [],
    date: ["Fecha Canje", "Fecha"],
    clientCode: ["SKU"], product: ["Producto_nombre"], quantity: [],
  };

  it("toma la fecha de la columna única (número de serie de Excel) y cuenta 1 por fila", () => {
    const result = canonicalizeEgressRecord({ "Fecha Canje": "45943.6", SKU: "URB-386", Producto_nombre: "Mate" }, mapping);
    expect(result.date?.toISOString().slice(0, 10)).toBe("2025-10-13");
    expect(result.quantity).toBe(1);
    expect(result.clientCode).toBe("URB-386");
  });

  it("acepta la fecha ya convertida a AAAA-MM-DD y en DD/MM/AAAA", () => {
    expect(canonicalizeEgressRecord({ "Fecha Canje": "2026-10-13", SKU: "U1" }, mapping).date?.toISOString().slice(0, 10)).toBe("2026-10-13");
    expect(canonicalizeEgressRecord({ "Fecha Canje": "13/10/2026", SKU: "U1" }, mapping).date?.toISOString().slice(0, 10)).toBe("2026-10-13");
  });

  it("si la cantidad tiene columna, usa ese valor", () => {
    const result = canonicalizeEgressRecord({ "Fecha Canje": "2026-10-13", SKU: "U1", Cantidad: "3" }, { ...mapping, quantity: ["Cantidad"] });
    expect(result.quantity).toBe(3);
  });

  it("sin fecha no inventa una", () => {
    expect(canonicalizeEgressRecord({ SKU: "U1" }, mapping).date).toBeNull();
  });
});
