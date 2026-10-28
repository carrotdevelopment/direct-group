import { z } from "zod";

// Secciones de Sistema > Configuración que se guardan en la tabla configuracion (una fila por clave).

export const organizationSchema = z.object({
  name: z.string().trim().min(1, "Indicá el nombre de la organización.").max(120),
  legalName: z.string().trim().max(160),
  cuit: z.string().trim().max(20).refine((value) => !value || /^\d{2}-?\d{8}-?\d$/.test(value), "El CUIT tiene que tener 11 números (por ejemplo 30-71824581-4)."),
  timeZone: z.string().trim().max(60),
  currency: z.string().trim().max(60),
  language: z.string().trim().max(60),
});
export type OrganizationSettings = z.infer<typeof organizationSchema>;

export const DEFAULT_ORGANIZATION: OrganizationSettings = {
  name: "Direct Group",
  legalName: "Direct Group Argentina SA",
  cuit: "30-71824581-4",
  timeZone: "America/Argentina/Buenos_Aires",
  currency: "ARS — Peso argentino",
  language: "Español (Argentina)",
};

export const notificationsSchema = z.object({
  recipients: z.array(z.string().trim().toLowerCase().email("Hay un correo que no es válido.")).max(10),
  urbano: z.boolean(),
  tango: z.boolean(),
  // Días hábiles seguidos sin ingresos nuevos de Tango a partir de los cuales se avisa (0 = no avisar).
  tangoIdleBusinessDays: z.number().int().min(0).max(30),
  backups: z.boolean(),
});
export type NotificationSettings = z.infer<typeof notificationsSchema>;

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  recipients: [],
  urbano: true,
  tango: true,
  tangoIdleBusinessDays: 3,
  backups: true,
};

// Días hábiles (lunes a viernes) completos entre dos fechas, sin contar el día de inicio.
export function businessDaysBetween(from: Date, to: Date) {
  let count = 0;
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 1));
  for (; day.getTime() <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}

// Correos a proveedores (Precios > pedido mensual de catálogo y reconsulta). En el asunto y el texto se
// pueden usar {contacto}, {proveedor} y {mes}; se reemplazan al enviar.
export const MAIL_PLACEHOLDERS = ["{contacto}", "{proveedor}", "{mes}"] as const;

const mailText = (label: string, max: number) => z.string().trim().min(1, `Completá ${label}.`).max(max);
export const supplierMailSchema = z.object({
  requestSubject: mailText("el asunto del pedido", 200),
  requestBody: mailText("el texto del pedido", 4000),
  followUpSubject: mailText("el asunto de la reconsulta", 200),
  followUpBody: mailText("el texto de la reconsulta", 4000),
});
export type SupplierMailTemplates = z.infer<typeof supplierMailSchema>;

export const DEFAULT_SUPPLIER_MAIL: SupplierMailTemplates = {
  requestSubject: "Solicitud de catálogo de productos - {proveedor} - {mes}",
  requestBody: [
    "Hola {contacto}, buenas tardes.",
    "",
    "Solicito el catálogo de productos y la lista de precios actualizada correspondiente a {mes}.",
    "",
    "Si es posible, que incluya código de producto, descripción, costo, IVA y precio sugerido de venta.",
    "",
    "Muchas gracias.",
    "",
    "Saludos,",
    "Direct Group",
  ].join("\n"),
  followUpSubject: "Re: Solicitud de catálogo de productos - {proveedor} - {mes}",
  followUpBody: [
    "Hola {contacto}, buenas tardes.",
    "",
    "¿Pudiste ver nuestro correo en el que te solicitamos el catálogo de productos y la lista de precios actualizada correspondiente a {mes}?",
    "",
    "Quedamos atentos. Muchas gracias.",
    "",
    "Saludos,",
    "Direct Group",
  ].join("\n"),
};

// Reemplaza los marcadores. Sin nombre de contacto, "Hola {contacto}, buenas tardes." queda "Hola, buenas tardes.".
export function renderMailTemplate(template: string, values: { contacto: string; proveedor: string; mes: string }) {
  return template
    .replace(/\{(contacto|proveedor|mes)\}/gi, (_, key: string) => values[key.toLowerCase() as keyof typeof values].trim())
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "");
}

export const settingSchemas = {
  organizacion: organizationSchema,
  notificaciones: notificationsSchema,
  correoProveedores: supplierMailSchema,
} as const;
export type SettingKey = keyof typeof settingSchemas;
export const SETTING_DEFAULTS: { [K in SettingKey]: z.infer<(typeof settingSchemas)[K]> } = {
  organizacion: DEFAULT_ORGANIZATION,
  notificaciones: DEFAULT_NOTIFICATIONS,
  correoProveedores: DEFAULT_SUPPLIER_MAIL,
};

export function isSettingKey(value: unknown): value is SettingKey {
  return typeof value === "string" && Object.hasOwn(settingSchemas, value);
}

// Lo guardado se completa con los valores por defecto (por si se agregan campos nuevos).
export function withDefaults<K extends SettingKey>(key: K, stored: unknown) {
  const merged = { ...SETTING_DEFAULTS[key], ...(stored && typeof stored === "object" ? stored : {}) };
  const parsed = settingSchemas[key].safeParse(merged);
  return (parsed.success ? parsed.data : SETTING_DEFAULTS[key]) as (typeof SETTING_DEFAULTS)[K];
}
