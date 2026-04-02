export function createServiceController(serviceRepository) {
  return {
    list(req, res) {
      const requests = serviceRepository.listByClientId(req.auth.client.id);
      return res.json({ items: requests });
    },
    create(req, res) {
      const payload = {
        ...req.body,
        clientId: req.auth.client.id,
        media: (req.files || []).map((file) => ({
          id: `media-${file.filename}`,
          type: file.mimetype.startsWith('video') ? 'video' : 'image',
          url: `/miniapp-telegram/uploads/${file.filename}`,
        })),
      };
      const created = serviceRepository.create(payload);
      return res.status(201).json(created);
    },
    status(req, res) {
      const request = serviceRepository.findById(req.params.id);
      if (!request || request.clientId !== req.auth.client.id) {
        return res.status(404).json({ error: 'Request not found' });
      }
      return res.json({ id: request.id, status: request.status, updatedAt: request.updatedAt });
    },
    updateStatus(req, res) {
      const request = serviceRepository.findById(req.params.id);
      if (!request || request.clientId !== req.auth.client.id) {
        return res.status(404).json({ error: 'Request not found' });
      }
      const nextStatus = String(req.body?.status || '').trim();
      if (!nextStatus) {
        return res.status(400).json({ error: 'status_required' });
      }
      request.status = nextStatus;
      request.updatedAt = new Date().toISOString();
      return res.json({ id: request.id, status: request.status, updatedAt: request.updatedAt });
    },
  };
}
