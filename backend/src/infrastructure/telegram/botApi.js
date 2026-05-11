export class TelegramBotGateway {
  constructor({ token }) {
    this.token = token;
  }

  async sendMessage(chatId, text) {
    if (!this.token) return { ok: false, reason: 'token_missing' };

    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });

    return response.json();
  }

  async sendPhoto(chatId, photo, caption = '') {
    if (!this.token) return { ok: false, reason: 'token_missing' };

    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, photo, caption }),
    });

    return response.json();
  }
}
