import { normalizeDatabaseUrl } from '../utils/databaseUrl.js';

export const config = {
  port: Number(process.env.PORT || 3000),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || 'TG_NOTIFY_BOT',
  telegramWebAppUrl: process.env.TELEGRAM_WEB_APP_URL || 'https://miniapp.surpresso.ru',
  telegramManagerChatIds: process.env.TELEGRAM_MANAGER_CHAT_IDS || '',
  telegramServiceHeadChatIds: process.env.TELEGRAM_SERVICE_HEAD_CHAT_IDS || '',
  telegramDirectorChatIds: process.env.TELEGRAM_DIRECTOR_CHAT_IDS || '',
  telegramSalesManagerChatIds: process.env.TELEGRAM_SALES_MANAGER_CHAT_IDS || '',
  telegramOwnerChatIds: process.env.TELEGRAM_OWNER_CHAT_IDS || '',
  telegramInitSecret: process.env.TELEGRAM_INIT_SECRET || '',
  mediaUploadPath: process.env.MEDIA_UPLOAD_PATH || 'miniapp-telegram/uploads',
  gasWebAppUrl: process.env.GAS_WEBAPP_URL || '',
  gasServerKey: process.env.GAS_SECRET || process.env.SURPRESSO_SERVER_KEY || '',
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || process.env.TELEGRAM_INIT_SECRET || 'change-me-admin-secret',
  telegramSessionCookieDomain: process.env.TELEGRAM_SESSION_COOKIE_DOMAIN || '',
  databaseUrl: normalizeDatabaseUrl(process.env.DATABASE_URL || ''),
};
