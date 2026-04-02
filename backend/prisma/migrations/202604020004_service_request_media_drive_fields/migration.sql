-- AlterTable
ALTER TABLE "ServiceRequestMedia"
ADD COLUMN     "fileId" TEXT,
ADD COLUMN     "previewUrl" TEXT,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "originalName" TEXT,
ADD COLUMN     "size" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ServiceRequestMedia"
RENAME COLUMN "url" TO "fileUrl";
