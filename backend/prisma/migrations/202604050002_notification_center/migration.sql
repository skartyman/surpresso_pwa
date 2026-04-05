-- Notification center and report hardening
CREATE TABLE "NotificationLog" (
  "id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "recipientRole" TEXT NOT NULL,
  "recipientChatId" TEXT NOT NULL,
  "digestType" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "payloadPreview" TEXT,
  "status" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "triggerType" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportExportHistory" (
  "id" TEXT NOT NULL,
  "reportType" TEXT NOT NULL,
  "format" TEXT NOT NULL,
  "triggerType" TEXT NOT NULL,
  "requestedByRole" TEXT,
  "requestedByUserId" TEXT,
  "filtersJson" TEXT,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReportExportHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReportPreset" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "reportType" TEXT NOT NULL,
  "filtersJson" TEXT NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "ownerRole" TEXT,
  "ownerUserId" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReportPreset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportPreset_key_key" ON "ReportPreset"("key");

CREATE INDEX "NotificationLog_channel_recipientRole_digestType_idx" ON "NotificationLog"("channel", "recipientRole", "digestType");
CREATE INDEX "NotificationLog_recipientChatId_payloadHash_createdAt_idx" ON "NotificationLog"("recipientChatId", "payloadHash", "createdAt");
CREATE INDEX "NotificationLog_status_createdAt_idx" ON "NotificationLog"("status", "createdAt");
CREATE INDEX "ReportExportHistory_reportType_createdAt_idx" ON "ReportExportHistory"("reportType", "createdAt");
CREATE INDEX "ReportExportHistory_triggerType_createdAt_idx" ON "ReportExportHistory"("triggerType", "createdAt");
CREATE INDEX "ReportPreset_reportType_idx" ON "ReportPreset"("reportType");
CREATE INDEX "ReportPreset_ownerRole_idx" ON "ReportPreset"("ownerRole");

ALTER TABLE "ReportPreset" ADD CONSTRAINT "ReportPreset_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
