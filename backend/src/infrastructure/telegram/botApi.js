export class TelegramBotGateway {
  constructor({ token }) {
    this.token = token;
  }

  async request(method, payload) {
    if (!this.token) return { ok: false, reason: 'token_missing' };

    const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return response.json();
  }

  async sendMessage(chatId, text) {
    return this.request('sendMessage', { chat_id: chatId, text });
  }

  async sendPhoto(chatId, photo, caption = '') {
    return this.request('sendPhoto', { chat_id: chatId, photo, caption });
  }

  async editMessageText(chatId, messageId, text) {
    return this.request('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
    });
  }

  async editMessageCaption(chatId, messageId, caption) {
    return this.request('editMessageCaption', {
      chat_id: chatId,
      message_id: messageId,
      caption,
    });
  }
}
