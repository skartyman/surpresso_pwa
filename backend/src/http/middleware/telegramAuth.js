import { config } from '../../config/env.js';
import { validateTelegramInitData } from '../../infrastructure/telegram/validateInitData.js';

export function telegramAuth(clientRepository) {
  return async (req, res, next) => {
    const initData = req.header('x-telegram-init-data') || req.query.initData;
    const validation = validateTelegramInitData(initData, config.telegramBotToken);

    if (!validation.valid || !validation.data?.user?.id) {
      return res.status(401).json({ error: 'Invalid Telegram init data' });
    }

    const client = await clientRepository.findByTelegramUserId(validation.data.user.id);
    if (!client) {
      return res.status(403).json({ error: 'Client profile not found' });
    }

    req.auth = { telegramUser: validation.data.user, client };
    return next();
  };
}
