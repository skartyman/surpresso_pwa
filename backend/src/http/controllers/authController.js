export function createAuthController() {
  return {
    me(req, res) {
      return res.json({ client: req.auth.client, telegramUser: req.auth.telegramUser });
    },
  };
}
