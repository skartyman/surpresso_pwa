-- AlterTable
ALTER TABLE "ServiceRequest"
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "assignedByUserId" TEXT;

-- Backfill assignedAt and assignedByUserId for existing assigned requests
UPDATE "ServiceRequest"
SET "assignedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP)
WHERE "assignedToUserId" IS NOT NULL
  AND "assignedAt" IS NULL;

-- CreateTable
CREATE TABLE "ServiceRequestAssignmentHistory" (
    "id" TEXT NOT NULL,
    "serviceRequestId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRequestAssignmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceRequest_assignedByUserId_idx" ON "ServiceRequest"("assignedByUserId");
CREATE INDEX "ServiceRequestAssignmentHistory_serviceRequestId_idx" ON "ServiceRequestAssignmentHistory"("serviceRequestId");
CREATE INDEX "ServiceRequestAssignmentHistory_fromUserId_idx" ON "ServiceRequestAssignmentHistory"("fromUserId");
CREATE INDEX "ServiceRequestAssignmentHistory_toUserId_idx" ON "ServiceRequestAssignmentHistory"("toUserId");
CREATE INDEX "ServiceRequestAssignmentHistory_assignedByUserId_idx" ON "ServiceRequestAssignmentHistory"("assignedByUserId");

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_assignedByUserId_fkey"
FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceRequestAssignmentHistory" ADD CONSTRAINT "ServiceRequestAssignmentHistory_serviceRequestId_fkey"
FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceRequestAssignmentHistory" ADD CONSTRAINT "ServiceRequestAssignmentHistory_fromUserId_fkey"
FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceRequestAssignmentHistory" ADD CONSTRAINT "ServiceRequestAssignmentHistory_toUserId_fkey"
FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceRequestAssignmentHistory" ADD CONSTRAINT "ServiceRequestAssignmentHistory_assignedByUserId_fkey"
FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
