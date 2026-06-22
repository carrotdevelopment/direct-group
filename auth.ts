import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/server/lib/prisma";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(128) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  providers: [Credentials({
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Contraseña", type: "password" } },
    async authorize(credentials) {
      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) return null;
      const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
      if (!user?.active || !(await compare(parsed.data.password, user.passwordHash))) return null;
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    },
  })],
  callbacks: {
    jwt({ token, user }) { if (user) token.role = user.role; return token; },
    session({ session, token }) { if (session.user) { session.user.id = token.sub ?? ""; session.user.role = token.role as "ADMIN" | "VENDEDOR" | "DEPOSITO" | "LECTURA"; } return session; },
  },
});
