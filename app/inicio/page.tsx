import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { accessModules } from "@/lib/module-access";

export default async function InicioPage() {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/productos");
  const firstModule = Object.keys(accessModules).find(key => user.moduleAccess.includes(key));
  redirect(firstModule ? `/${firstModule}` : "/sin-acceso");
}
