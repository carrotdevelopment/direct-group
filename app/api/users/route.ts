import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/server/lib/prisma";
import { checkApiAccess } from "@/server/lib/access";
import { passwordSchema } from "@/lib/password-policy";
import { accessModules, type AccessModule } from "@/lib/module-access";

const fields = { id: true, name: true, email: true, role: true, active: true, moduleAccess: true, lastLoginAt: true } as const;
const schema = z.object({
  name: z.string().trim().min(1).max(120), email: z.string().trim().email().transform(value => value.toLowerCase()),
  role: z.enum(["ADMIN", "VENDEDOR", "DEPOSITO", "LECTURA"]), active: z.boolean(),
  moduleAccess: z.array(z.enum(Object.keys(accessModules) as [AccessModule, ...AccessModule[]])).max(8),
  password: passwordSchema.optional(),
});

export async function GET() {
  const denied = await checkApiAccess(["admin"]); if (denied) return denied;
  return NextResponse.json({ users: await prisma.user.findMany({ select: fields, orderBy: { name: "asc" } }) });
}

async function save(request: Request, update: boolean) {
  const denied = await checkApiAccess(["admin"], true); if (denied) return denied;
  const actor = (await auth())?.user;
  if (!actor || actor.role !== "ADMIN") return NextResponse.json({ message: "Se revocó tu acceso administrador." }, { status: 403 });
  try {
    const body = await request.json();
    const input = schema.parse(body);
    const id = update ? z.string().min(1).parse(body.id) : undefined;
    if (!update && !input.password) return NextResponse.json({ message: "Ingresá una contraseña de al menos 12 caracteres." }, { status: 400 });
    if (id === actor.id && (!input.active || input.role !== "ADMIN")) return NextResponse.json({ message: "No podés quitarte el acceso administrador ni deshabilitar tu propia cuenta." }, { status: 400 });
    const { password, ...data } = input;
    const passwordHash = password ? await hash(password, 12) : undefined;
    const user = await prisma.$transaction(async tx => {
      const currentActor = await tx.user.findUnique({ where: { id: actor.id } });
      if (!currentActor?.active || currentActor.role !== "ADMIN") throw new Error("ACCESS_REVOKED");
      const previous = id ? await tx.user.findUniqueOrThrow({ where: { id }, select: fields }) : null;
      const result = id
        ? await tx.user.update({ where: { id }, data: { ...data, ...(passwordHash ? { passwordHash } : {}) }, select: fields })
        : await tx.user.create({ data: { ...data, passwordHash: passwordHash! }, select: fields });
      if (await tx.user.count({ where: { active: true, role: "ADMIN" } }) === 0) throw new Error("LAST_ADMIN");
      await tx.auditLog.create({ data: { userId: actor.id, entity: "User", recordId: result.id, action: id ? "UPDATE_ACCESS" : "CREATE_USER", previousData: previous ? JSON.parse(JSON.stringify(previous)) : undefined, newData: JSON.parse(JSON.stringify(result)) } });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ message: "Revisá los datos: nombre, email, módulos y contraseña de al menos 12 caracteres y hasta 72 bytes UTF-8." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return NextResponse.json({ message: "Ya existe un usuario con ese email." }, { status: 409 });
      if (error.code === "P2025") return NextResponse.json({ message: "Usuario inexistente." }, { status: 404 });
      if (error.code === "P2034") return NextResponse.json({ message: "Hubo otro cambio simultáneo. Volvé a intentar." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ACCESS_REVOKED") return NextResponse.json({ message: "Se revocó tu acceso administrador." }, { status: 403 });
    if (error instanceof Error && error.message === "LAST_ADMIN") return NextResponse.json({ message: "Debe quedar al menos un administrador activo." }, { status: 400 });
    return NextResponse.json({ message: "No se pudo guardar el usuario." }, { status: 500 });
  }
}
export async function POST(request: Request) { return save(request, false); }
export async function PUT(request: Request) { return save(request, true); }
