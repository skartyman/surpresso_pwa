export function createSupportController(botGateway) {
  return {
    async notify(req, res) {
      const chatId = req.body.chatId;
      const message = req.body.message || 'Статус заявки обновлен';
      const result = await botGateway.sendMessage(chatId, message);
      return res.json(result);
    },
  };
}
