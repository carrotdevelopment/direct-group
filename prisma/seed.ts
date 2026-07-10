import { PrismaClient, Role } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hash(process.env.SEED_ADMIN_PASSWORD ?? "DirectGroup2026!", 12);
  const admin = await prisma.user.upsert({ where: { email: "admin@directgroup.local" }, update: {}, create: { name: "Administrador DG", email: "admin@directgroup.local", passwordHash, role: Role.ADMIN } });
  const [warehouse, client, supplier, brand, category] = await Promise.all([
    prisma.warehouse.upsert({ where: { code: "DEP-CENTRAL" }, update: {}, create: { code: "DEP-CENTRAL", name: "Depósito central" } }),
    prisma.client.upsert({ where: { code: "CLI-00018" }, update: {}, create: { code: "CLI-00018", name: "Supermercados Norte SA", legalName: "Supermercados Norte SA", taxId: "30-71284721-8", segment: "Retail" } }),
    prisma.supplier.upsert({ where: { code: "PRV-0004" }, update: {}, create: { code: "PRV-0004", name: "Molinos Río de la Plata", taxId: "30-50085862-8" } }),
    prisma.brand.upsert({ where: { name: "Natura" }, update: {}, create: { name: "Natura" } }),
    prisma.category.upsert({ where: { name: "Aceites" }, update: {}, create: { name: "Aceites" } }),
  ]);
  const product = await prisma.product.upsert({ where: { internalCode: "DG-002841" }, update: {}, create: { internalCode: "DG-002841", name: "Aceite de girasol 1,5 L", brandId: brand.id, categoryId: category.id, primarySupplierId: supplier.id, unitsPerPackage: 12, createdBy: admin.id, updatedBy: admin.id } });
  const codeValidFrom = new Date("2026-01-01T00:00:00.000Z");
  await prisma.clientProductCode.upsert({ where: { clientId_clientCode_validFrom: { clientId: client.id, clientCode: "NAT-ACE-15", validFrom: codeValidFrom } }, update: {}, create: { clientId: client.id, productId: product.id, clientCode: "NAT-ACE-15", clientDescription: "Aceite Natura 1.5", validFrom: codeValidFrom, changeReason: "Alta inicial", createdBy: admin.id } });
  await prisma.stockMovement.upsert({ where: { idempotencyKey: "seed:initial-stock:DG-002841" }, update: {}, create: { productId: product.id, stockClientId: client.id, warehouseId: warehouse.id, type: "MANUAL_ADJUSTMENT_IN", direction: "IN", quantity: 2480, comments: "Stock inicial del entorno local", createdBy: admin.id, idempotencyKey: "seed:initial-stock:DG-002841" } });
  console.info("Seed completo. Usuario: admin@directgroup.local");
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(async () => prisma.$disconnect());
