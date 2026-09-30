import { DuplicateProductCodeError, validateProductCodes } from "@/lib/product-uniqueness";
import { checkApiAccess } from "@/server/lib/access";
import { NextResponse } from "next/server";
import { Prisma } from "@/node_modules/.prisma/excel-client";
import {
  readProductsFromExcel,
  writeProductsToExcel,
  type ExcelProduct,
} from "@/lib/local-excel-db";
import { usesPostgres } from "@/lib/data-source";
import {
  readProductsFromPostgres,
  writeProductsToPostgres,
} from "@/lib/postgres-replica-db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = await checkApiAccess(["productos"], false);
  if (denied) return denied;
  const includeInactive =
    new URL(request.url).searchParams.get("includeInactive") === "true";
  const allProducts = usesPostgres()
    ? await readProductsFromPostgres()
    : readProductsFromExcel();
  const products = includeInactive
    ? allProducts
    : allProducts.filter((product) => product.active);
  return NextResponse.json({ products, source: usesPostgres() ? "postgresql" : "excel" });
}

export async function PUT(request: Request) {
  const denied = await checkApiAccess(["productos"], true);
  if (denied) return denied;
  const body = (await request.json()) as { products?: ExcelProduct[] };
  const products = body.products ?? [];
  try {
    validateProductCodes(products);
    if (usesPostgres()) {
      const saved = await writeProductsToPostgres(products);
      return NextResponse.json({ products: saved, source: "postgresql" });
    }
    validateProductCodes(products, readProductsFromExcel());
    writeProductsToExcel(products);
    return NextResponse.json({ products, source: "excel" });
  } catch (error) {
    if (error instanceof DuplicateProductCodeError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { message: "Ese código único ya existe. Otra persona lo cargó mientras tanto." },
        { status: 409 },
      );
    }
    throw error;
  }
}
