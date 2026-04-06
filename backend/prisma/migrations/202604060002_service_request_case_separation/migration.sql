CREATE TYPE "EquipmentPlacement" AS ENUM ('workshop', 'at_location', 'on_rent', 'on_replacement', 'sold');
CREATE TYPE "WorkshopStage" AS ENUM ('arrived_waiting', 'in_progress', 'testing', 'ready');
CREATE TYPE "ServiceRequestStatus" AS ENUM ('new', 'assigned', 'taken_in_work', 'ready_for_qc', 'on_service_head_control', 'to_director', 'invoiced', 'closed', 'cancelled');

CREATE TABLE "Network" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "legalName" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Network_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Location" (
  "id" TEXT NOT NULL,
  "networkId" TEXT NOT NULL,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "city" TEXT,
  "address" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PointUser" (
  "id" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "clientId" TEXT,
  "networkId" TEXT,
  "locationId" TEXT,
  "role" TEXT NOT NULL,
  "fullName" TEXT,
  "phone" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PointUser_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Equipment"
  ADD COLUMN "networkId" TEXT,
  ADD COLUMN "locationId" TEXT,
  ADD COLUMN "currentPlacement" "EquipmentPlacement",
  ADD COLUMN "workshopStage" "WorkshopStage";

ALTER TABLE "ServiceCase"
  ADD COLUMN "serviceRequestId" TEXT;

ALTER TABLE "ServiceRequest"
  ADD COLUMN "pointUserId" TEXT,
  ADD COLUMN "locationId" TEXT;

ALTER TABLE "ServiceRequest"
  ALTER COLUMN "status" TYPE "ServiceRequestStatus"
  USING (
    CASE
      WHEN "status" IN ('new', 'assigned', 'taken_in_work', 'ready_for_qc', 'on_service_head_control', 'to_director', 'invoiced', 'closed', 'cancelled') THEN "status"::"ServiceRequestStatus"
      WHEN "status" = 'in_progress' THEN 'taken_in_work'::"ServiceRequestStatus"
      WHEN "status" = 'resolved' THEN 'ready_for_qc'::"ServiceRequestStatus"
      ELSE 'new'::"ServiceRequestStatus"
    END
  );

CREATE TABLE "CommercialStatusHistory" (
  "id" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "serviceCaseId" TEXT,
  "fromCommercialStatus" "EquipmentCommercialStatus",
  "toCommercialStatus" "EquipmentCommercialStatus" NOT NULL,
  "comment" TEXT,
  "actorLabel" TEXT,
  "changedByUserId" TEXT,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EquipmentMedia" (
  "id" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "serviceCaseId" TEXT,
  "kind" "MediaKind" NOT NULL,
  "filePath" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "mimeType" TEXT,
  "originalName" TEXT,
  "fileSize" INTEGER NOT NULL DEFAULT 0,
  "caption" TEXT,
  "uploadedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentMedia_pkey" PRIMARY KEY ("id")
);

INSERT INTO "EquipmentMedia" (
  "id", "equipmentId", "serviceCaseId", "kind", "filePath", "fileUrl", "mimeType", "originalName", "fileSize", "caption", "uploadedByUserId", "createdAt"
)
SELECT
  "id", "equipmentId", "serviceCaseId", "kind", "filePath", "fileUrl", "mimeType", "originalName", "fileSize", "caption", "uploadedByUserId", "createdAt"
FROM "ServiceCaseMedia";

DROP TABLE "ServiceCaseMedia";

CREATE UNIQUE INDEX "PointUser_telegramUserId_key" ON "PointUser"("telegramUserId");
CREATE INDEX "Location_networkId_idx" ON "Location"("networkId");
CREATE INDEX "PointUser_clientId_idx" ON "PointUser"("clientId");
CREATE INDEX "PointUser_networkId_idx" ON "PointUser"("networkId");
CREATE INDEX "PointUser_locationId_idx" ON "PointUser"("locationId");
CREATE INDEX "Equipment_networkId_idx" ON "Equipment"("networkId");
CREATE INDEX "Equipment_locationId_idx" ON "Equipment"("locationId");
CREATE INDEX "ServiceCase_serviceRequestId_idx" ON "ServiceCase"("serviceRequestId");
CREATE INDEX "CommercialStatusHistory_equipmentId_idx" ON "CommercialStatusHistory"("equipmentId");
CREATE INDEX "CommercialStatusHistory_serviceCaseId_idx" ON "CommercialStatusHistory"("serviceCaseId");
CREATE INDEX "CommercialStatusHistory_changedByUserId_idx" ON "CommercialStatusHistory"("changedByUserId");
CREATE INDEX "EquipmentMedia_equipmentId_idx" ON "EquipmentMedia"("equipmentId");
CREATE INDEX "EquipmentMedia_serviceCaseId_idx" ON "EquipmentMedia"("serviceCaseId");
CREATE INDEX "EquipmentMedia_uploadedByUserId_idx" ON "EquipmentMedia"("uploadedByUserId");
CREATE INDEX "ServiceRequest_pointUserId_idx" ON "ServiceRequest"("pointUserId");
CREATE INDEX "ServiceRequest_locationId_idx" ON "ServiceRequest"("locationId");

ALTER TABLE "Location" ADD CONSTRAINT "Location_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PointUser" ADD CONSTRAINT "PointUser_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PointUser" ADD CONSTRAINT "PointUser_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PointUser" ADD CONSTRAINT "PointUser_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "Network"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceCase" ADD CONSTRAINT "ServiceCase_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EquipmentMedia" ADD CONSTRAINT "EquipmentMedia_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EquipmentMedia" ADD CONSTRAINT "EquipmentMedia_serviceCaseId_fkey" FOREIGN KEY ("serviceCaseId") REFERENCES "ServiceCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EquipmentMedia" ADD CONSTRAINT "EquipmentMedia_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommercialStatusHistory" ADD CONSTRAINT "CommercialStatusHistory_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommercialStatusHistory" ADD CONSTRAINT "CommercialStatusHistory_serviceCaseId_fkey" FOREIGN KEY ("serviceCaseId") REFERENCES "ServiceCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommercialStatusHistory" ADD CONSTRAINT "CommercialStatusHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_pointUserId_fkey" FOREIGN KEY ("pointUserId") REFERENCES "PointUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;
