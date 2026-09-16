import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { passwordSchema } from "../lib/password-policy";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient();
async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "juanmartin@directgroup.local").trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { email }, data: { role: "ADMIN", active: true } });
    console.info(`Administrador habilitado: ${email}. Se conservó su contraseña.`);
    return;
  }
  const password = process.env.SEED_ADMIN_PASSWORD || randomBytes(24).toString("base64url");
  passwordSchema.parse(password);
  const directory = resolve("local-data/private");
  mkdirSync(directory, { recursive: true });
  const file = resolve(directory, "admin-access.txt");
  // Write privately before insertion, so a failed file write cannot lose the password.
  writeFileSync(file, `Direct Group — acceso administrador\nEmail: ${email}\nContraseña: ${password}\nIngresar en /login. Podés cambiar la contraseña desde Permisos.\n`, { mode: 0o600, flag: "wx" });
  await prisma.user.create({ data: { email, name: process.env.SEED_ADMIN_NAME ?? "Juan Martín", passwordHash: await hash(password, 12), role: "ADMIN" } });
  console.info(`Administrador creado: ${email}. Credenciales guardadas en ${file}`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "No se pudo crear el administrador"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
