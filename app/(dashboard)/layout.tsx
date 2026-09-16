import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!(await auth())?.user) redirect("/login");
  return <AppShell>{children}</AppShell>;
}
