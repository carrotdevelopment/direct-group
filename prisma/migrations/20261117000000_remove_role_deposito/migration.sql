-- Se quita el tipo de acceso Depósito: funcionaba igual que Operador. Los usuarios que lo tengan pasan a Operador.
UPDATE "User" SET "role" = 'VENDEDOR' WHERE "role" = 'DEPOSITO';

ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('ADMIN', 'VENDEDOR', 'LECTURA');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'LECTURA';
DROP TYPE "Role_old";
