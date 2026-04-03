-- Guard migration: ensures legacy databases allow ServiceRequest without equipment link.
ALTER TABLE "ServiceRequest"
ALTER COLUMN "equipmentId" DROP NOT NULL;
