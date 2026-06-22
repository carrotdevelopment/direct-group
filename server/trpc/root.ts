import { router } from "./init";
import { productsRouter } from "./routers/products";
import { stockRouter } from "./routers/stock";

export const appRouter = router({ products: productsRouter, stock: stockRouter });
export type AppRouter = typeof appRouter;
