import { config } from '../../config/env.js';

function parseChatIds(chatIdsRaw) {
  return String(chatIdsRaw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export class ServiceRequestNotifier {
  constructor(botGateway, managerChatIdsRaw) {
    this.botGateway = botGateway;
    this.managerChatIds = parseChatIds(managerChatIdsRaw);
  }

  async notifyNewServiceRequest(message) {
    if (!this.managerChatIds.length) {
      return { ok: false, reason: 'manager_chat_ids_missing' };
    }

    const results = await Promise.allSettled(
      this.managerChatIds.map((chatId) => this.botGateway.sendMessage(chatId, message)),
    );

    return {
      ok: true,
      sent: results.filter((result) => result.status === 'fulfilled').length,
      failed: results.filter((result) => result.status === 'rejected').length,
    };
  }
}

export function createServiceRequestNotifier(botGateway) {
  return new ServiceRequestNotifier(botGateway, config.telegramManagerChatIds);
}
