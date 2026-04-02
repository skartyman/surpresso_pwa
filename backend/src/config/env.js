export const config = {
  port: Number(process.env.PORT || 3000),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || 'TG_NOTIFY_BOT',
  telegramWebAppUrl: process.env.TELEGRAM_WEB_APP_URL || 'https://miniapp.surpresso.ru',
  telegramManagerChatIds: process.env.TELEGRAM_MANAGER_CHAT_IDS || '',
  telegramInitSecret: process.env.TELEGRAM_INIT_SECRET || '',
  mediaUploadPath: process.env.MEDIA_UPLOAD_PATH || 'miniapp-telegram/uploads',
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || process.env.TELEGRAM_INIT_SECRET || 'change-me-admin-secret',
  databaseUrl: process.env.DATABASE_URL || '',
};
