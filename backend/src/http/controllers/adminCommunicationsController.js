export function createAdminCommunicationsController() {
  const templates = [
    { id: 'tpl-1', name: 'Welcome', text: 'Добро пожаловать в Surpresso Mini App' },
    { id: 'tpl-2', name: 'Service Follow-up', text: 'Пожалуйста, оцените качество сервиса' },
  ];

  return {
    templates(_, res) {
      return res.json({ templates });
    },
    broadcast(req, res) {
      const payload = {
        audience: req.body?.audience || 'all_clients',
        segment: req.body?.segment || null,
        message: String(req.body?.message || '').trim(),
        templateId: req.body?.templateId || null,
        sentAt: new Date().toISOString(),
      };

      if (!payload.message && !payload.templateId) {
        return res.status(400).json({ error: 'message_or_template_required' });
      }

      return res.status(201).json({
        broadcast: {
          id: `broadcast-${Date.now()}`,
          status: 'queued',
          ...payload,
        },
      });
    },
  };
}
