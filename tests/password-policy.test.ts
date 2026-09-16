import { describe, expect, it } from "vitest";
import { passwordSchema } from "@/lib/password-policy";
import { sessionVersion } from "@/server/lib/session-version";

describe("contraseñas y sesiones", () => {
  it("rechaza contraseñas cortas y acepta el límite de bcrypt", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("x".repeat(72)).success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(73)).success).toBe(false);
  });
  it("mide bytes y no sólo caracteres", () => {
    expect(passwordSchema.safeParse("á".repeat(36)).success).toBe(true);
    expect(passwordSchema.safeParse("á".repeat(37)).success).toBe(false);
  });
  it("la versión de sesión cambia al cambiar el hash y no expone ese hash", () => {
    const original = sessionVersion("original-password-hash");
    expect(original).toBe(sessionVersion("original-password-hash"));
    expect(original).not.toBe(sessionVersion("new-password-hash"));
    expect(original).not.toContain("original-password-hash");
  });
});
