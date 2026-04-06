-- Equipment operational entities: comments, notes, service tasks

CREATE TABLE IF NOT EXISTS "EquipmentComment" (
  "id" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "authorUserId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EquipmentNote" (
  "id" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "authorUserId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ServiceTask" (
  "id" TEXT NOT NULL,
  "serviceCaseId" TEXT,
  "equipmentId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL,
  "assignedToUserId" TEXT,
  "createdByUserId" TEXT,
  "dueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EquipmentComment_equipmentId_idx" ON "EquipmentComment"("equipmentId");
CREATE INDEX IF NOT EXISTS "EquipmentComment_authorUserId_idx" ON "EquipmentComment"("authorUserId");
CREATE INDEX IF NOT EXISTS "EquipmentNote_equipmentId_idx" ON "EquipmentNote"("equipmentId");
CREATE INDEX IF NOT EXISTS "EquipmentNote_authorUserId_idx" ON "EquipmentNote"("authorUserId");
CREATE INDEX IF NOT EXISTS "ServiceTask_serviceCaseId_idx" ON "ServiceTask"("serviceCaseId");
CREATE INDEX IF NOT EXISTS "ServiceTask_equipmentId_idx" ON "ServiceTask"("equipmentId");
CREATE INDEX IF NOT EXISTS "ServiceTask_status_idx" ON "ServiceTask"("status");
CREATE INDEX IF NOT EXISTS "ServiceTask_assignedToUserId_idx" ON "ServiceTask"("assignedToUserId");

ALTER TABLE "EquipmentComment" ADD CONSTRAINT "EquipmentComment_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipmentComment" ADD CONSTRAINT "EquipmentComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EquipmentNote" ADD CONSTRAINT "EquipmentNote_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipmentNote" ADD CONSTRAINT "EquipmentNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceTask" ADD CONSTRAINT "ServiceTask_serviceCaseId_fkey" FOREIGN KEY ("serviceCaseId") REFERENCES "ServiceCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceTask" ADD CONSTRAINT "ServiceTask_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceTask" ADD CONSTRAINT "ServiceTask_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceTask" ADD CONSTRAINT "ServiceTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
