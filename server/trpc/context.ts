import { auth } from "@/auth";
import { prisma } from "@/server/lib/prisma";

export async function createTRPCContext() {
  const session = await auth();
  return { session, prisma };
}
export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;
