import "server-only";
import { auth } from "@/auth";
import { hasModule } from "@/lib/module-access";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

export async function requirePageModule(module: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasModule(session.user, module)) redirect("/sin-acceso");
  return session.user;
}

export async function checkApiAccess(modules: string[], write = false) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ message: "Iniciá sesión para continuar." }, { status: 401 });
  if (!modules.some(module => hasModule(session.user, module)) || (write && session.user.role === "LECTURA")) {
    return NextResponse.json({ message: "No tenés permiso para realizar esta operación." }, { status: 403 });
  }
  return null;
}
