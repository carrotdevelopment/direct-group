import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function NoAccessPage() {
  if (!(await auth())?.user) redirect("/login");
  return <AppShell><h1 className="text-2xl font-bold">Sin acceso a este módulo</h1><p className="my-4">Pedile al administrador que revise tus permisos.</p><Link href="/inicio" className="underline">Ir a mis módulos</Link></AppShell>;
}
