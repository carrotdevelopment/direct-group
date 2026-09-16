export const accessModules = {
  compras: "Compras e ingresos",
  precios: "Precios y estructura de costos",
  proveedores: "Proveedores",
  clientes: "Clientes y códigos",
  productos: "Productos",
  ventas: "Ventas y egresos",
  stock: "Stock",
  importaciones: "Importaciones",
} as const;

export type AccessModule = keyof typeof accessModules;
export type AccessUser = { role: string; moduleAccess: string[] };
export function hasModule(user: AccessUser | null | undefined, module: string) {
  return !!user && (user.role === "ADMIN" || (module !== "admin" && user.moduleAccess.includes(module)));
}

export function pageModule(path: string): string {
  const section = path.split("/").filter(Boolean)[0] ?? "";
  const map: Record<string, string> = {
    compras: "compras", ingresos: "compras", precios: "precios", pricing: "precios",
    "estructura-costos": "precios", proveedores: "proveedores", clientes: "clientes",
    "codigos-clientes": "clientes", productos: "productos", ventas: "ventas",
    egresos: "ventas", stock: "stock", importaciones: "importaciones",
  };
  return map[section] ?? "admin";
}
