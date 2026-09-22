import { redirect } from "next/navigation";
import { requirePageModule } from "@/server/lib/access";

export const metadata = { title: "Compras" };

export default async function ComprasPage() {
  await requirePageModule("compras");
  // Deshabilitado a pedido: el módulo de Compras se reemplaza por Pasajes y Ajustes.
  redirect("/ingresos");
}
