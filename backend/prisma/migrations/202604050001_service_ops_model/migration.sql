-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('company', 'client');
CREATE TYPE "ClientServiceType" AS ENUM ('service_contract', 'regular_client');
CREATE TYPE "EquipmentType" AS ENUM ('grinder', 'pro_coffee', 'auto_coffee', 'filter_system');
CREATE TYPE "EquipmentServiceStatus" AS ENUM ('accepted', 'in_progress', 'testing', 'ready', 'processed', 'closed', 'cancelled');
CREATE TYPE "EquipmentCommercialStatus" AS ENUM ('issued_to_client', 'ready_for_issue', 'ready_for_rent', 'out_on_rent', 'out_on_replacement', 'ready_for_sale', 'reserved_for_rent', 'reserved_for_sale', 'sold');
CREATE TYPE "ServiceIntakeType" AS ENUM ('client_repair', 'after_rent', 'after_replacement', 'new_purchase', 'manual_intake');
CREATE TYPE "MediaKind" AS ENUM ('photo', 'video', 'document');
CREATE TYPE "InvoiceStatus" AS ENUM ('not_required', 'pending', 'issued', 'paid', 'cancelled');

-- AlterTable Equipment (nullable guards + new service/commercial layers)
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "ownerType" "OwnerType";
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "clientServiceType" "ClientServiceType";
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "equipmentType" "EquipmentType";
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "currentStatusRaw" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "serviceStatus" "EquipmentServiceStatus";
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "commercialStatus" "EquipmentCommercialStatus";
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "clientName" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "clientPhone" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "clientLocation" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "companyLocation" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "lastComment" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "folderId" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "folderUrl" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "passportPdfId" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "passportPdfUrl" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "qrUrl" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Equipment" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "Equipment" ALTER COLUMN "model" DROP NOT NULL;
ALTER TABLE "Equipment" ALTER COLUMN "serial" DROP NOT NULL;
ALTER TABLE "Equipment" ALTER COLUMN "internalNumber" DROP NOT NULL;

-- Recreate FK for nullable clientId
ALTER TABLE "Equipment" DROP CONSTRAINT IF EXISTS "Equipment_clientId_fkey";
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable ServiceCase
CREATE TABLE IF NOT EXISTS "ServiceCase" (
  "id" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "intakeType" "ServiceIntakeType" NOT NULL,
  "serviceStatus" "EquipmentServiceStatus" NOT NULL,
  "commercialStatusAfter" "EquipmentCommercialStatus",
  "priority" TEXT,
  "problemDescription" TEXT,
  "damageDescription" TEXT,
  "intakeComment" TEXT,
  "closingComment" TEXT,
  "ownerTypeSnapshot" "OwnerType",
  "clientServiceTypeSnapshot" "ClientServiceType",
  "clientNameSnapshot" TEXT,
  "clientPhoneSnapshot" TEXT,
  "clientLocationSnapshot" TEXT,
  "companyLocationSnapshot" TEXT,
  "modelSnapshot" TEXT,
  "serialNumberSnapshot" TEXT,
  "internalNumberSnapshot" TEXT,
  "equipmentNameSnapshot" TEXT,
  "assignedToUserId" TEXT,
  "assignedByUserId" TEXT,
  "processedByUserId" TEXT,
  "invoiceNumber" TEXT,
  "invoiceStatus" "InvoiceStatus",
  "acceptedAt" TIMESTAMP(3),
  "assignedAt" TIMESTAMP(3),
  "testingAt" TIMESTAMP(3),
  "readyAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ServiceCaseMedia" (
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
  CONSTRAINT "ServiceCaseMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ServiceStatusHistory" (
  "id" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "serviceCaseId" TEXT,
  "fromStatusRaw" TEXT,
  "toStatusRaw" TEXT NOT NULL,
  "fromServiceStatus" "EquipmentServiceStatus",
  "toServiceStatus" "EquipmentServiceStatus",
  "comment" TEXT,
  "actorLabel" TEXT,
  "changedByUserId" TEXT,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ServiceCaseNote" (
  "id" TEXT NOT NULL,
  "serviceCaseId" TEXT NOT NULL,
  "authorUserId" TEXT,
  "body" TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceCaseNote_pkey" PRIMARY KEY ("id")
);

-- Indices
CREATE INDEX IF NOT EXISTS "Equipment_ownerType_idx" ON "Equipment"("ownerType");
CREATE INDEX IF NOT EXISTS "Equipment_clientServiceType_idx" ON "Equipment"("clientServiceType");
CREATE INDEX IF NOT EXISTS "Equipment_equipmentType_idx" ON "Equipment"("equipmentType");
CREATE INDEX IF NOT EXISTS "Equipment_serviceStatus_idx" ON "Equipment"("serviceStatus");
CREATE INDEX IF NOT EXISTS "Equipment_commercialStatus_idx" ON "Equipment"("commercialStatus");
CREATE INDEX IF NOT EXISTS "Equipment_internalNumber_idx" ON "Equipment"("internalNumber");
CREATE INDEX IF NOT EXISTS "Equipment_serial_idx" ON "Equipment"("serial");

CREATE INDEX IF NOT EXISTS "ServiceCase_equipmentId_idx" ON "ServiceCase"("equipmentId");
CREATE INDEX IF NOT EXISTS "ServiceCase_serviceStatus_idx" ON "ServiceCase"("serviceStatus");
CREATE INDEX IF NOT EXISTS "ServiceCase_assignedToUserId_idx" ON "ServiceCase"("assignedToUserId");
CREATE INDEX IF NOT EXISTS "ServiceCase_acceptedAt_idx" ON "ServiceCase"("acceptedAt");

CREATE INDEX IF NOT EXISTS "ServiceCaseMedia_equipmentId_idx" ON "ServiceCaseMedia"("equipmentId");
CREATE INDEX IF NOT EXISTS "ServiceCaseMedia_serviceCaseId_idx" ON "ServiceCaseMedia"("serviceCaseId");
CREATE INDEX IF NOT EXISTS "ServiceCaseMedia_uploadedByUserId_idx" ON "ServiceCaseMedia"("uploadedByUserId");

CREATE INDEX IF NOT EXISTS "ServiceStatusHistory_equipmentId_idx" ON "ServiceStatusHistory"("equipmentId");
CREATE INDEX IF NOT EXISTS "ServiceStatusHistory_serviceCaseId_idx" ON "ServiceStatusHistory"("serviceCaseId");
CREATE INDEX IF NOT EXISTS "ServiceStatusHistory_changedByUserId_idx" ON "ServiceStatusHistory"("changedByUserId");

CREATE INDEX IF NOT EXISTS "ServiceCaseNote_serviceCaseId_idx" ON "ServiceCaseNote"("serviceCaseId");
CREATE INDEX IF NOT EXISTS "ServiceCaseNote_authorUserId_idx" ON "ServiceCaseNote"("authorUserId");

-- Foreign keys
ALTER TABLE "ServiceCase" ADD CONSTRAINT "ServiceCase_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceCase" ADD CONSTRAINT "ServiceCase_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceCase" ADD CONSTRAINT "ServiceCase_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceCase" ADD CONSTRAINT "ServiceCase_processedByUserId_fkey" FOREIGN KEY ("processedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceCaseMedia" ADD CONSTRAINT "ServiceCaseMedia_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceCaseMedia" ADD CONSTRAINT "ServiceCaseMedia_serviceCaseId_fkey" FOREIGN KEY ("serviceCaseId") REFERENCES "ServiceCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceCaseMedia" ADD CONSTRAINT "ServiceCaseMedia_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceStatusHistory" ADD CONSTRAINT "ServiceStatusHistory_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceStatusHistory" ADD CONSTRAINT "ServiceStatusHistory_serviceCaseId_fkey" FOREIGN KEY ("serviceCaseId") REFERENCES "ServiceCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceStatusHistory" ADD CONSTRAINT "ServiceStatusHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceCaseNote" ADD CONSTRAINT "ServiceCaseNote_serviceCaseId_fkey" FOREIGN KEY ("serviceCaseId") REFERENCES "ServiceCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceCaseNote" ADD CONSTRAINT "ServiceCaseNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
