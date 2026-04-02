export function createServiceController(serviceRepository) {
  return {
    async list(req, res) {
      const requests = await serviceRepository.listByClientId(req.auth.client.id);
      return res.json({ items: requests });
    },
    async create(req, res) {
      const payload = {
        ...req.body,
        canOperateNow: req.body?.canOperateNow ?? req.body?.canOperate ?? false,
        source: req.body?.source || 'telegram_miniapp',
        clientId: req.auth.client.id,
        media: (req.files || []).map((file) => ({
          id: `media-${file.filename}`,
          type: file.mimetype.startsWith('video') ? 'video' : 'image',
          url: `/miniapp-telegram/uploads/${file.filename}`,
        })),
      };
      const created = await serviceRepository.create(payload);
      return res.status(201).json(created);
    },
    async status(req, res) {
      const request = await serviceRepository.findById(req.params.id);
      if (!request || request.clientId !== req.auth.client.id) {
        return res.status(404).json({ error: 'Request not found' });
      }
      return res.json({ id: request.id, status: request.status, updatedAt: request.updatedAt });
    },
    async updateStatus(req, res) {
      const request = await serviceRepository.findById(req.params.id);
      if (!request || request.clientId !== req.auth.client.id) {
        return res.status(404).json({ error: 'Request not found' });
      }
      const nextStatus = String(req.body?.status || '').trim();
      if (!nextStatus) {
        return res.status(400).json({ error: 'status_required' });
      }
      try {
        const updated = await serviceRepository.updateStatus(request.id, nextStatus);
        return res.json({ id: updated.id, status: updated.status, updatedAt: updated.updatedAt });
      } catch {
        return res.status(500).json({ error: 'status_update_failed' });
      }
    },
  };
}
