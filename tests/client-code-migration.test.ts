import { describe, expect, it } from "vitest";
import { checkMigration, type MigrationCode } from "@/lib/client-code-migration";
import { realStockForCode } from "@/lib/stock-operations";

const code = (client: string, clientCode: string, uniqueCode: string, active = true, voided = false): MigrationCode => ({ client, clientCode, uniqueCode, active, voided });
const codes = [
  code("Pampa", "75-5030", "30433", false),
  code("Pampa", "76-5030", "30433"),
  code("Pampa", "76-5099", "otro"),
  code("Amex", "DG99-0001", "30433"),
];

describe("migración de código cliente: reglas", () => {
  it("permite migrar a un código existente del mismo cliente y producto", () => {
    expect(checkMigration(codes, "Pampa", "75-5030", "76-5030")).toEqual({
      ok: true, client: "Pampa", oldCode: "75-5030", newCode: "76-5030", uniqueCode: "30433", newExists: true,
    });
  });

  it("si el código nuevo no existe, se da de alta con el mismo producto", () => {
    expect(checkMigration(codes, "pampa", "75-5030", "77-5030")).toMatchObject({ ok: true, newExists: false, uniqueCode: "30433" });
  });

  it("rechaza un código nuevo de otro producto o de otro cliente, y el mismo código", () => {
    expect(checkMigration(codes, "Pampa", "75-5030", "76-5099")).toMatchObject({ ok: false });
    expect(checkMigration(codes, "Pampa", "75-5030", "DG99-0001")).toMatchObject({ ok: false, error: expect.stringContaining("Amex") });
    expect(checkMigration(codes, "Pampa", "75-5030", "75-5030")).toMatchObject({ ok: false });
  });

  it("el código a migrar tiene que ser del cliente elegido", () => {
    expect(checkMigration(codes, "Pampa", "DG99-0001", "76-5030")).toMatchObject({ ok: false, error: expect.stringContaining("no está asignado a Pampa") });
  });
});

describe("stock real de un código (misma cuenta que la pantalla Stock)", () => {
  const incomes = [
    { clientCode: "75-5030", operation: "COMPRA", delivered: 30 },
    { clientCode: "75-5030", operation: "PASAJE", delivered: 5 },
    { clientCode: "75-5030", operation: "AJUSTE NO VALORIZADO", delivered: 100 },
    { clientCode: "76-5030", operation: "COMPRA", delivered: 7 },
  ];
  const egresses = [
    { clientCode: "75-5030", operation: "CANJE", quantity: 10 },
    { clientCode: "75-5030", operation: "ROBO_AJUSTE", quantity: 2 },
    { clientCode: "75-5030", operation: "REENVIO", quantity: 50 },
  ];

  it("suma lo entregado de ingresos y resta canjes, ajustes, pasajes y cambios", () => {
    expect(realStockForCode("Pampa", "75-5030", incomes, egresses)).toEqual({ income: 35, egress: 12, stock: 23 });
  });

  it("en Umiles también suman los ajustes de ingreso de Tango", () => {
    expect(realStockForCode("Umiles", "75-5030", incomes, egresses).income).toBe(135);
  });
});
