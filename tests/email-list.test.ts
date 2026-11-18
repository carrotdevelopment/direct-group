import { describe, expect, it } from "vitest";
import { formatEmailList, parseEmailList, splitEmails } from "@/lib/email-list";

describe("lista de correos de un contacto", () => {
  it("acepta varios correos separados por barra, coma o punto y coma", () => {
    expect(parseEmailList("nbianucci@zecat.com / jmorales@zecat.com")).toEqual(["nbianucci@zecat.com", "jmorales@zecat.com"]);
    expect(parseEmailList("a@x.com,b@x.com; c@x.com")).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });
  it("saca repetidos sin importar mayúsculas", () => {
    expect(parseEmailList("Ventas@x.com, ventas@x.com")).toEqual(["Ventas@x.com"]);
  });
  it("rechaza si alguno no es un correo o no hay ninguno", () => {
    expect(parseEmailList("a@x.com / Karen")).toBeNull();
    expect(parseEmailList("   ")).toBeNull();
  });
  it("guarda con coma y se vuelve a separar igual", () => {
    const saved = formatEmailList(["a@x.com", "b@x.com"]);
    expect(saved).toBe("a@x.com, b@x.com");
    expect(splitEmails(saved)).toEqual(["a@x.com", "b@x.com"]);
  });
});
