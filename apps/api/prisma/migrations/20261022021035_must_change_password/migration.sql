-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "studentEmail" VARCHAR(254);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
