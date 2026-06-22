import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TRPCContext } from "./context";
import type { Role } from "@/lib/permissions";

const t = initTRPC.context<TRPCContext>().create({ transformer: superjson });
export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, session: { ...ctx.session, user: ctx.session.user } } });
});
export const requireRoles = (roles: Role[]) => protectedProcedure.use(({ ctx, next }) => {
  if (!roles.includes(ctx.session.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});
