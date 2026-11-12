import { describe, expect, it } from "vitest";
import { productBulkRowsFromSheet } from "@/lib/product-bulk-file";

describe("carga masiva de productos desde Excel", () => {
  it("reconoce las columnas por el encabezado, en cualquier orden y con o sin tildes", () => {
    const rows = productBulkRowsFromSheet([
      ["Codigo Unico", "Producto", "Categoría", "Proveedor", "Bulto", "Marca", "Código proveedor"],
      ["421000005", " Freidora Air 5 ", "ELECTRO", "ACEGAME", 4, "Smart Tek", "AC-5"],
      ["", "", "", "", "", "", ""],
    ]);
    expect(rows).toEqual([{
      name: "Freidora Air 5", brand: "Smart Tek", code: "421000005", supplier: "ACEGAME", category: "ELECTRO", unitsPerPackage: "4", supplierCode: "AC-5",
    }]);
  });

  it("sin encabezado toma las columnas en el orden de la plantilla", () => {
    expect(productBulkRowsFromSheet([["Mochila", "Marca X", "30433"]])).toEqual([{
      name: "Mochila", brand: "Marca X", code: "30433", supplier: "", category: "", unitsPerPackage: "", supplierCode: "",
    }]);
  });
});
