CREATE TABLE "TelegramPost" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "serviceCaseId" TEXT,
    "kind" TEXT NOT NULL,
    "broadcastKey" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "editCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TelegramPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramPost_chatId_messageId_key" ON "TelegramPost"("chatId", "messageId");
CREATE INDEX "TelegramPost_equipmentId_kind_createdAt_idx" ON "TelegramPost"("equipmentId", "kind", "createdAt");
CREATE INDEX "TelegramPost_broadcastKey_idx" ON "TelegramPost"("broadcastKey");
