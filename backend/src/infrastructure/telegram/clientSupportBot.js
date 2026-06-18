import { TelegramBotGateway } from './botApi.js';

const SYSTEM_PROMPT = `Ти — ввічливий помічник сервісного центру Surpresso. Ти спілкуєшся з клієнтами, які звертаються по ремонт кофейного обладнання.

Твої завдання:
1. Привітайся та представися
2. Дізнайся короткий опис проблеми
3. Уточни терміновість (критично / до 3 днів / цього тижня)
4. Запитай адресу та контактний телефон
5. Запитай зручний час для виїзду майстра

Веди діалог природньо, по-українськи. Не питай все одразу — задавай по 1-2 питання за раз.

Коли збереш ВСЮ необхідну інформацію, виведи в кінці повідомлення рядок:
---DATA---
{ "problem": "...", "urgency": "...", "address": "...", "phone": "...", "preferredTime": "..." }
---DATA---

Проблема має бути коротким описом (1-2 речення).
Urgency: "критично" | "до 3 днів" | "цього тижня"
Якщо якогось поля немає — залиши порожнім.`;

export class ClientSupportBot {
  constructor({ token, groqApiKey, groqModel, trelloClient }) {
    this.bot = new TelegramBotGateway({ token });
    this.groqApiKey = groqApiKey;
    this.groqModel = groqModel || 'meta-llama/llama-4-scout-17b-16e-instruct';
    this.trelloClient = trelloClient;
    this.conversations = new Map();
  }

  async handleUpdate(update) {
    const msg = update.message;
    if (!msg?.text) return;

    const chatId = msg.chat.id;
    const userId = msg.from?.id?.toString() || chatId.toString();
    const text = msg.text;

    if (text === '/start') {
      await this.startConversation(chatId, userId, msg.from);
      return;
    }

    const reply = await this.askGemini(text, userId, chatId);
    if (!reply) return;

    const dataMatch = reply.match(/---DATA---\s*(\{[\s\S]*?\})\s*---DATA---/);
    if (dataMatch) {
      try {
        const data = JSON.parse(dataMatch[1]);
        const cleanReply = reply.replace(/---DATA---[\s\S]*?---DATA---/, '').trim();
        if (cleanReply) await this.bot.sendMessage(chatId, cleanReply);
        await this.finalizeRequest(chatId, userId, data);
      } catch {
        await this.bot.sendMessage(chatId, reply);
      }
    } else {
      await this.bot.sendMessage(chatId, reply);
    }
  }

  async startConversation(chatId, userId, from) {
    const firstName = from?.first_name || 'Користувач';
    this.conversations.set(userId, {
      history: [],
      startedAt: Date.now(),
    });

    const greeting = `👋 Привіт, ${firstName}! Я — помічник сервісного центру Surpresso.

Допоможу швидко оформити заявку на ремонт вашого обладнання. 

Розкажіть, що трапилось?`;
    await this.bot.sendMessage(chatId, greeting);
  }

  async askGemini(text, userId, chatId) {
    const conv = this.conversations.get(userId) || { history: [] };
    conv.history.push({ role: 'user', content: text });
    this.conversations.set(userId, conv);

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conv.history.slice(-20).map(m => ({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content,
      })),
    ];

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.groqApiKey}`,
        },
        body: JSON.stringify({
          model: this.groqModel,
          messages,
          temperature: 0.7,
          max_tokens: 800,
        }),
      });

      const data = await res.json();
      const raw = data?.choices?.[0]?.message?.content || '';
      const reply = raw && !raw.startsWith('ERROR:') && !/this model does not support/i.test(raw)
        ? raw
        : 'Вибачте, сталася помилка. Спробуйте ще раз.';

      conv.history.push({ role: 'assistant', content: reply });
      this.conversations.set(userId, conv);

      return reply;
    } catch (err) {
      console.error('Groq error:', err);
      return 'На жаль, тимчасова помилка. Будь ласка, спробуйте пізніше.';
    }
  }

  async finalizeRequest(chatId, userId, data) {
    this.conversations.delete(userId);

    const name = `Заявка: ${data.problem?.slice(0, 80) || 'Ремонт'}`;
    const desc = [
      `🚨 Терміновість: ${data.urgency || 'не вказано'}`,
      ``,
      `📋 Опис: ${data.problem || 'не вказано'}`,
      ``,
      `📍 Адреса: ${data.address || 'не вказано'}`,
      `📞 Телефон: ${data.phone || 'не вказано'}`,
      `🕐 Зручний час: ${data.preferredTime || 'не вказано'}`,
      ``,
      `👤 Джерело: Telegram-бот`,
      `🆔 Chat ID: ${chatId}`,
    ].join('\n');

    try {
      const card = await this.trelloClient.createCard({ name, desc });
      await this.bot.sendMessage(chatId,
        `✅ Дякуємо! Заявку прийнято. Номер: **${card.idShort || card.id}**\n\nНайближчим часом з вами зв'яжеться майстер.`
      );
    } catch (err) {
      console.error('Trello error:', err);
      await this.bot.sendMessage(chatId,
        '❌ Сталася помилка при створенні заявки. Адміністратор вже повідомлений. Спробуйте пізніше.'
      );
    }
  }
}
