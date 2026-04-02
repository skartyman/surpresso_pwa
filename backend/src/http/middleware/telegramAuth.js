import { config } from '../../config/env.js';
import { validateTelegramInitData } from '../../infrastructure/telegram/validateInitData.js';

function toContactName(telegramUser = {}) {
  const first = String(telegramUser.first_name || '').trim();
  const last = String(telegramUser.last_name || '').trim();
  const full = `${first} ${last}`.trim();
  return full || String(telegramUser.username || '').trim() || `Telegram user ${telegramUser.id}`;
}

export function telegramAuth(clientRepository) {
  return async (req, res, next) => {
    const initData = req.header('x-telegram-init-data') || req.query.initData;
    const validation = validateTelegramInitData(initData, config.telegramBotToken);

    if (!validation.valid || !validation.data?.user?.id) {
      return res.status(401).json({ error: 'Invalid Telegram init data' });
    }

    const telegramUser = validation.data.user;

    console.info('[telegramAuth] Telegram session validated', {
      telegramUserId: String(telegramUser.id),
      username: telegramUser.username || null,
      first_name: telegramUser.first_name || null,
    });

    let client = null;

    if (typeof clientRepository.findOrCreateFromTelegramUser === 'function') {
      client = await clientRepository.findOrCreateFromTelegramUser(telegramUser, {
        contactName: toContactName(telegramUser),
        companyName: 'Telegram client',
        phone: '',
        isActive: true,
      });
    } else {
      client = await clientRepository.findByTelegramUserId(telegramUser.id);
    }

    console.info('[telegramAuth] Client profile lookup completed', {
      telegramUserId: String(telegramUser.id),
      username: telegramUser.username || null,
      first_name: telegramUser.first_name || null,
      clientFound: Boolean(client),
      clientId: client?.id || null
    });

    if (!client) {
      return res.status(403).json({
        error: 'client_profile_not_found',
        message: 'Client profile was not found for the authenticated Telegram user',
        details: {
          telegramUserId: String(telegramUser.id),
          username: telegramUser.username || null,
          first_name: telegramUser.first_name || null,
        },
      });
    }

    req.auth = { telegramUser, client };
    return next();
  };
}
