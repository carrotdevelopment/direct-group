import { stockTransferSchema } from "@/server/schemas/stock";
import { requireRoles, router } from "@/server/trpc/init";
import { transferStock } from "@/server/services/stock.service";

export const stockRouter = router({
  transfer: requireRoles(["ADMIN", "DEPOSITO"]).input(stockTransferSchema).mutation(({ ctx, input }) => transferStock(input, { id: ctx.session.user.id, role: ctx.session.user.role })),
});
