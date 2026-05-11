CREATE TABLE IF NOT EXISTS "EquipmentPlacementHistory" (
  "id" TEXT NOT NULL,
  "equipmentId" TEXT NOT NULL,
  "clientId" TEXT,
  "locationId" TEXT,
  "serviceRequestId" TEXT,
  "ownerType" "OwnerType" NOT NULL,
  "placement" "EquipmentPlacement" NOT NULL,
  "label" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "changedByUserId" TEXT,
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EquipmentPlacementHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EquipmentPlacementHistory_equipmentId_idx" ON "EquipmentPlacementHistory"("equipmentId");
CREATE INDEX IF NOT EXISTS "EquipmentPlacementHistory_clientId_idx" ON "EquipmentPlacementHistory"("clientId");
CREATE INDEX IF NOT EXISTS "EquipmentPlacementHistory_locationId_idx" ON "EquipmentPlacementHistory"("locationId");
CREATE INDEX IF NOT EXISTS "EquipmentPlacementHistory_serviceRequestId_idx" ON "EquipmentPlacementHistory"("serviceRequestId");
CREATE INDEX IF NOT EXISTS "EquipmentPlacementHistory_startedAt_idx" ON "EquipmentPlacementHistory"("startedAt");
CREATE INDEX IF NOT EXISTS "EquipmentPlacementHistory_endedAt_idx" ON "EquipmentPlacementHistory"("endedAt");

ALTER TABLE "EquipmentPlacementHistory"
  ADD CONSTRAINT "EquipmentPlacementHistory_equipmentId_fkey"
  FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EquipmentPlacementHistory"
  ADD CONSTRAINT "EquipmentPlacementHistory_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EquipmentPlacementHistory"
  ADD CONSTRAINT "EquipmentPlacementHistory_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EquipmentPlacementHistory"
  ADD CONSTRAINT "EquipmentPlacementHistory_serviceRequestId_fkey"
  FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EquipmentPlacementHistory"
  ADD CONSTRAINT "EquipmentPlacementHistory_changedByUserId_fkey"
  FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Client" ("id", "telegramUserId", "companyName", "contactName", "phone", "isActive", "createdAt", "updatedAt")
SELECT 'client-surpresso', 'surpresso-company', 'Surpresso', 'Surpresso', '', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Client" WHERE "id" = 'client-surpresso');

INSERT INTO "Network" ("id", "name", "legalName", "isActive", "createdAt", "updatedAt")
SELECT 'network-surpresso', 'Surpresso', 'Surpresso', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Network" WHERE "id" = 'network-surpresso');

INSERT INTO "Location" ("id", "networkId", "code", "name", "city", "address", "isActive", "createdAt", "updatedAt")
SELECT 'location-surpresso-workshop', 'network-surpresso', 'SURPRESSO', 'Surpresso', NULL, 'Surpresso', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Location" WHERE "id" = 'location-surpresso-workshop');

UPDATE "Equipment"
SET
  "clientId" = COALESCE("clientId", 'client-surpresso'),
  "networkId" = COALESCE("networkId", 'network-surpresso'),
  "locationId" = COALESCE("locationId", 'location-surpresso-workshop'),
  "ownerType" = COALESCE("ownerType", 'company'::"OwnerType"),
  "clientName" = COALESCE("clientName", 'Surpresso'),
  "companyLocation" = COALESCE("companyLocation", 'Surpresso'),
  "currentPlacement" = COALESCE("currentPlacement", 'workshop'::"EquipmentPlacement")
WHERE "clientId" IS NULL OR "locationId" IS NULL OR "ownerType" IS NULL OR "currentPlacement" IS NULL;

INSERT INTO "EquipmentPlacementHistory" (
  "id",
  "equipmentId",
  "clientId",
  "locationId",
  "ownerType",
  "placement",
  "label",
  "startedAt",
  "comment",
  "createdAt"
)
SELECT
  'eph-seed-' || "id",
  "id",
  "clientId",
  "locationId",
  COALESCE("ownerType", 'company'::"OwnerType"),
  COALESCE("currentPlacement", 'workshop'::"EquipmentPlacement"),
  COALESCE("clientName", "clientLocation", "companyLocation", 'Surpresso'),
  COALESCE("createdAt", CURRENT_TIMESTAMP),
  'Initial placement snapshot',
  CURRENT_TIMESTAMP
FROM "Equipment"
WHERE NOT EXISTS (
  SELECT 1 FROM "EquipmentPlacementHistory" eph WHERE eph."equipmentId" = "Equipment"."id"
);
