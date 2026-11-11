-- CreateEnum
CREATE TYPE "SemesterTerm" AS ENUM ('FIRST', 'SECOND', 'SUMMER');

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "academicPeriodId" UUID;

-- CreateTable
CREATE TABLE "academic_periods" (
    "id" UUID NOT NULL,
    "academicYear" VARCHAR(16) NOT NULL,
    "semester" "SemesterTerm" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_periods_isCurrent_idx" ON "academic_periods"("isCurrent");

-- Seed the first period so existing reports are never left unattributed.
INSERT INTO "academic_periods" ("id", "academicYear", "semester", "startsAt", "endsAt", "isCurrent", "createdAt", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001', '2026/2027', 'FIRST', '2026-08-01', '2026-12-31 23:59:59', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- CreateIndex
CREATE UNIQUE INDEX "academic_periods_academicYear_semester_key" ON "academic_periods"("academicYear", "semester");

-- CreateIndex
CREATE INDEX "tickets_academicPeriodId_idx" ON "tickets"("academicPeriodId");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_academicPeriodId_fkey" FOREIGN KEY ("academicPeriodId") REFERENCES "academic_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill existing reports into the current period.
UPDATE "tickets"
SET "academicPeriodId" = (
  SELECT "id" FROM "academic_periods" WHERE "isCurrent" = true ORDER BY "startsAt" DESC LIMIT 1
)
WHERE "academicPeriodId" IS NULL;
