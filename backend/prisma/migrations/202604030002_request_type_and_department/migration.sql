-- AlterTable
ALTER TABLE "ServiceRequest"
ADD COLUMN "type" TEXT NOT NULL DEFAULT 'service_repair',
ADD COLUMN "title" TEXT NOT NULL DEFAULT '',
ADD COLUMN "assignedDepartment" TEXT NOT NULL DEFAULT 'service';

UPDATE "ServiceRequest"
SET
  "type" = COALESCE(NULLIF("type", ''), 'service_repair'),
  "title" = CASE WHEN COALESCE("title", '') = '' THEN LEFT(COALESCE("description", ''), 120) ELSE "title" END,
  "assignedDepartment" = CASE
    WHEN COALESCE("type", 'service_repair') = 'service_repair' THEN 'service'
    ELSE 'sales'
  END;
