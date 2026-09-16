import { stockTransferSchema } from "@/server/schemas/stock";
import { requireModule, router } from "@/server/trpc/init";
import { transferStock } from "@/server/services/stock.service";

export const stockRouter = router({
  transfer: requireModule("stock", true).input(stockTransferSchema).mutation(({ ctx, input }) => transferStock(input, { id: ctx.session.user.id, role: ctx.session.user.role })),
});
