import express from 'express';

export function createWebhookRouter(botGateway) {
  const router = express.Router();

  router.post('/webhook', async (req, res) => {
    const update = req.body;
    if (update?.message?.text === '/start') {
      const chatId = update.message.chat.id;
      await botGateway.sendMessage(chatId, 'Відкрийте клієнтський кабінет Surpresso через кнопку нижче.');
    }

    return res.json({ ok: true });
  });

  return router;
}
