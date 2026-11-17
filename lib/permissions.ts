// Tipos de acceso de un usuario. Lo que puede ver cada uno lo definen sus módulos (lib/module-access.ts):
// el administrador entra a todo; solo lectura consulta sin modificar.
export const roles = ["ADMIN", "VENDEDOR", "LECTURA"] as const;
export type Role = (typeof roles)[number];
