export const roles = ["ADMIN", "VENDEDOR", "DEPOSITO", "LECTURA"] as const;
export type Role = (typeof roles)[number];

export const modules = [
  "productos", "clientes", "proveedores", "pricing", "ventas", "compras",
  "stock", "importaciones", "auditoria", "configuracion",
] as const;
export type Module = (typeof modules)[number];
export type Action = "read" | "create" | "update" | "delete" | "operate";

const all: Action[] = ["read", "create", "update", "delete", "operate"];

export const permissionMatrix: Record<Role, Partial<Record<Module, Action[]>>> = {
  ADMIN: Object.fromEntries(modules.map((module) => [module, all])) as Record<Module, Action[]>,
  VENDEDOR: {
    productos: ["read"], clientes: ["read", "create", "update"], proveedores: ["read"],
    pricing: ["read"], ventas: ["read", "create", "update", "operate"], compras: ["read"],
    stock: ["read"], importaciones: ["read", "create", "operate"],
  },
  DEPOSITO: {
    productos: ["read"], clientes: ["read"], proveedores: ["read"], ventas: ["read"],
    compras: ["read"], stock: ["read", "create", "update", "operate"], importaciones: ["read"],
  },
  LECTURA: Object.fromEntries(modules.map((module) => [module, ["read"]])) as Record<Module, Action[]>,
};

export function can(role: Role, module: Module, action: Action) {
  return permissionMatrix[role][module]?.includes(action) ?? false;
}
