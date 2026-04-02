const ALLOWED_STATUSES = ['new', 'in_progress', 'resolved', 'closed'];

function normalizeStatus(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return ALLOWED_STATUSES.includes(normalized) ? normalized : null;
}

export function createAdminServiceController(serviceRepository) {
  return {
    async list(req, res) {
      const status = normalizeStatus(req.query?.status);
      if (req.query?.status && !status) {
        return res.status(400).json({ error: 'invalid_status' });
      }

      const requests = await serviceRepository.listForAdmin({ status });
      return res.json({ requests });
    },

    async byId(req, res) {
      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      return res.json({ request });
    },

    async updateStatus(req, res) {
      const nextStatus = normalizeStatus(req.body?.status);
      if (!nextStatus) {
        return res.status(400).json({ error: 'invalid_status' });
      }

      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }

      const updated = await serviceRepository.updateStatus(request.id, nextStatus);
      return res.json({ request: updated });
    },
  };
}
