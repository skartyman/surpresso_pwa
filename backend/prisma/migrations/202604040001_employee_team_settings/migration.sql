-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('field', 'inhouse', 'hybrid');

-- AlterTable
ALTER TABLE "User"
  ALTER COLUMN "phone" DROP DEFAULT,
  ALTER COLUMN "phone" DROP NOT NULL,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "workMode" "WorkMode",
  ADD COLUMN "capacity" INTEGER DEFAULT 6,
  ADD COLUMN "maxCritical" INTEGER DEFAULT 2,
  ADD COLUMN "priorityWeight" INTEGER DEFAULT 0,
  ADD COLUMN "canTakeUrgent" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "canTakeFieldRequests" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UserSpecialization" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "specializationKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSpecialization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBrandSkill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "brandKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBrandSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserZone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "zoneKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserZone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSpecialization_userId_specializationKey_key" ON "UserSpecialization"("userId", "specializationKey");
CREATE INDEX "UserSpecialization_specializationKey_idx" ON "UserSpecialization"("specializationKey");
CREATE INDEX "UserSpecialization_userId_idx" ON "UserSpecialization"("userId");

CREATE UNIQUE INDEX "UserBrandSkill_userId_brandKey_key" ON "UserBrandSkill"("userId", "brandKey");
CREATE INDEX "UserBrandSkill_brandKey_idx" ON "UserBrandSkill"("brandKey");
CREATE INDEX "UserBrandSkill_userId_idx" ON "UserBrandSkill"("userId");

CREATE UNIQUE INDEX "UserZone_userId_zoneKey_key" ON "UserZone"("userId", "zoneKey");
CREATE INDEX "UserZone_zoneKey_idx" ON "UserZone"("zoneKey");
CREATE INDEX "UserZone_userId_idx" ON "UserZone"("userId");

-- AddForeignKey
ALTER TABLE "UserSpecialization" ADD CONSTRAINT "UserSpecialization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBrandSkill" ADD CONSTRAINT "UserBrandSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserZone" ADD CONSTRAINT "UserZone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
