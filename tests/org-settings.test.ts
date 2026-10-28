import { describe, expect, it } from "vitest";
import { businessDaysBetween, DEFAULT_NOTIFICATIONS, notificationsSchema, organizationSchema, withDefaults } from "@/lib/org-settings";

describe("configuración de la organización", () => {
  it("lo guardado se completa con los valores por defecto y lo inválido vuelve al defecto", () => {
    expect(withDefaults("notificaciones", { recipients: ["liz@directgroup.com.ar"] })).toEqual({ ...DEFAULT_NOTIFICATIONS, recipients: ["liz@directgroup.com.ar"] });
    expect(withDefaults("notificaciones", { tangoIdleBusinessDays: -3 })).toEqual(DEFAULT_NOTIFICATIONS);
    expect(withDefaults("organizacion", null).name).toBe("Direct Group");
  });

  it("valida el CUIT y los correos de los avisos", () => {
    const base = withDefaults("organizacion", null);
    expect(organizationSchema.safeParse({ ...base, cuit: "30718245814" }).success).toBe(true);
    expect(organizationSchema.safeParse({ ...base, cuit: "30-123" }).success).toBe(false);
    expect(organizationSchema.safeParse({ ...base, name: " " }).success).toBe(false);
    expect(notificationsSchema.safeParse({ ...DEFAULT_NOTIFICATIONS, recipients: ["no-es-correo"] }).success).toBe(false);
    expect(notificationsSchema.parse({ ...DEFAULT_NOTIFICATIONS, recipients: [" Liz@DirectGroup.com.ar "] }).recipients).toEqual(["liz@directgroup.com.ar"]);
  });

  it("cuenta días hábiles completos sin contar el día de inicio", () => {
    const viernes = new Date("2026-10-23T12:00:00Z");
    expect(businessDaysBetween(viernes, new Date("2026-10-26T09:00:00Z"))).toBe(1); // sáb, dom, lun
    expect(businessDaysBetween(viernes, new Date("2026-10-28T09:00:00Z"))).toBe(3);
    expect(businessDaysBetween(viernes, viernes)).toBe(0);
  });
});
