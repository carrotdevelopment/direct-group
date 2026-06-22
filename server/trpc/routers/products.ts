import { createProductSchema, productListSchema } from "@/server/schemas/product";
import { requireRoles, router } from "@/server/trpc/init";

export const productsRouter = router({
  list: requireRoles(["ADMIN", "VENDEDOR", "DEPOSITO", "LECTURA"]).input(productListSchema).query(async ({ ctx, input }) => {
    const where = input.query ? { OR: [{ name: { contains: input.query, mode: "insensitive" as const } }, { internalCode: { contains: input.query, mode: "insensitive" as const } }] } : {};
    const [items, total] = await ctx.prisma.$transaction([ctx.prisma.product.findMany({ where, include: { brand: true, category: true, primarySupplier: true }, orderBy: { name: "asc" }, skip: (input.page - 1) * input.pageSize, take: input.pageSize }), ctx.prisma.product.count({ where })]);
    return { items, total, page: input.page, pageSize: input.pageSize };
  }),
  create: requireRoles(["ADMIN"]).input(createProductSchema).mutation(async ({ ctx, input }) => ctx.prisma.$transaction(async (tx) => {
    const product = await tx.product.create({ data: { ...input, createdBy: ctx.session.user.id, updatedBy: ctx.session.user.id } });
    await tx.auditLog.create({ data: { userId: ctx.session.user.id, action: "CREATE", entity: "Product", recordId: product.id, newData: input } });
    return product;
  })),
});
