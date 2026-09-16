import type { DefaultSession } from "next-auth";
import type { Role } from "@/lib/permissions";

declare module "next-auth" {
  interface User { role: Role; moduleAccess: string[]; credentialVersion?: string }
  interface Session { user: DefaultSession["user"] & { id: string; role: Role; moduleAccess: string[] } }
}

declare module "next-auth/jwt" { interface JWT { role?: Role; credentialVersion?: string } }
