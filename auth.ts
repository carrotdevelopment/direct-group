import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/server/lib/prisma";
import { sessionVersion } from "@/server/lib/session-version";

const credentialsSchema = z.object({ email: z.string().trim().email(), password: z.string().min(8).max(72).refine(value => new TextEncoder().encode(value).length <= 72) });

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
      return { id: user.id, name: user.name, email: user.email, role: user.role, moduleAccess: user.moduleAccess, credentialVersion: sessionVersion(user.passwordHash) };
    },
  })],
  callbacks: {
    jwt({ token, user }) {
      if (user) { token.role = user.role; token.credentialVersion = user.credentialVersion; }
      return token;
    },
    async session({ session, token }) {
      const user = token.sub ? await prisma.user.findUnique({ where: { id: token.sub } }) : null;
      if (!user?.active || token.credentialVersion !== sessionVersion(user.passwordHash)) return { ...session, user: undefined } as unknown as typeof session;
      session.user = { ...session.user, id: user.id, name: user.name, email: user.email, role: user.role, moduleAccess: user.moduleAccess };
      return session;
    },
  },
});
