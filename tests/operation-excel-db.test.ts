import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendEgressRecords,
  deleteEgressRecords,
  egressSchemas,
  readEgressRows,
  updateEgressRecord,
} from "@/lib/operation-excel-db";
import {
  readFreightCriteria,
  upsertFreightCriterion,
  writePricesToExcel,
} from "@/lib/local-excel-db";

let folder = "";
let previousFolder: string | undefined;

function santanderRow(overrides: Record<string, unknown> = {}) {
  return {
    ...Object.fromEntries(egressSchemas.Santander.map((header) => [header, ""])),
    Dia: "20",
    Mes: "8",
    Año: "2026",
    SKU: "DIR001",
    ID: "Producto inicial",
    Cantidad: "1",
    Operación: "CANJE",
    ...overrides,
  };
}

beforeEach(() => {
  previousFolder = process.env.DG_LOCAL_DB_DIR;
  folder = fs.mkdtempSync(path.join(os.tmpdir(), "dg-egress-excel-"));
  process.env.DG_LOCAL_DB_DIR = folder;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([santanderRow()]),
    "Santander",
  );
  XLSX.writeFile(workbook, path.join(folder, "Base Egresos Santander DG.xlsx"));
});

afterEach(() => {
  if (previousFolder === undefined) delete process.env.DG_LOCAL_DB_DIR;
  else process.env.DG_LOCAL_DB_DIR = previousFolder;
  fs.rmSync(folder, { recursive: true, force: true });
});

describe("egresos sobre Excel", () => {
  it("agrega, actualiza y elimina sin crear un JSON paralelo", () => {
    const appended = appendEgressRecords("Santander", [
      santanderRow({ SKU: "DIR002", ID: "Producto nuevo", Operación: "PASAJE" }),
    ]);
    expect(appended.insertedRows).toBe(1);

    let rows = readEgressRows({ client: "Santander", limit: 10 });
    expect(rows).toHaveLength(2);
    expect(rows[0].SKU).toBe("DIR002");

    expect(
      updateEgressRecord("Santander", Number(rows[0].__rowIndex), {
        ...rows[0],
        Cantidad: "3",
      }),
    ).toBe(true);
    rows = readEgressRows({ client: "Santander", limit: 10 });
    expect(rows[0].Cantidad).toBe("3");

    expect(deleteEgressRecords("Santander", [Number(rows[0].__rowIndex)])).toBe(1);
    expect(readEgressRows({ client: "Santander", limit: 10 })).toHaveLength(1);
    expect(fs.existsSync(path.join(folder, "Base Egresos Santander DG.json"))).toBe(false);
  });

  it("mantiene precios y criterios de flete dentro de archivos Excel", () => {
    const costWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      costWorkbook,
      XLSX.utils.json_to_sheet([{ Cliente: "Santander", Periodo: "2026-08" }]),
      "Santander",
    );
    const costPath = path.join(folder, "Base Estructura Costos Santander DG.xlsx");
    XLSX.writeFile(costWorkbook, costPath);

    upsertFreightCriterion("DG-001", {
      mode: "pct",
      value: 4.5,
      effectiveFrom: "2026-08",
    });
    expect(readFreightCriteria()["DG-001"]).toEqual([
      { mode: "pct", value: 4.5, effectiveFrom: "2026-08" },
    ]);
    expect(XLSX.readFile(costPath, { bookSheets: true }).SheetNames).toContain(
      "Criterios Flete",
    );

    writePricesToExcel([
      {
        id: "price-1",
        supplier: "Proveedor",
        uniqueCode: "DG-001",
        informedAt: "2026-08-20",
        costDg: 100,
        vatRate: 21,
        publicPrice: 150,
        markup: 50,
      },
    ]);
    expect(fs.existsSync(path.join(folder, "Base Precios DG.xlsx"))).toBe(true);
    expect(fs.existsSync(path.join(folder, "Base Precios DG.json"))).toBe(false);
    expect(fs.existsSync(path.join(folder, "Base Criterios Flete DG.json"))).toBe(false);
  });
});
