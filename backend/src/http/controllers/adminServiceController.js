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

      const id = String(req.query?.id || '').trim() || null;
      const client = String(req.query?.client || '').trim() || null;
      const equipment = String(req.query?.equipment || '').trim() || null;
      const requests = await serviceRepository.listForAdmin({ status, id, client, equipment });
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

      const comment = String(req.body?.comment || '').trim();

      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }

      const updated = await serviceRepository.updateStatus(request.id, nextStatus, {
        changedByUserId: req.adminUser?.id || null,
        changedByRole: req.adminUser?.role || null,
        comment: comment || null,
      });
      return res.json({ request: updated });
    },

    async history(req, res) {
      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      const history = await serviceRepository.listHistory(request.id);
      return res.json({ history });
    },

    async notes(req, res) {
      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      const notes = await serviceRepository.listInternalNotes(request.id);
      return res.json({ notes });
    },

    async addNote(req, res) {
      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }

      const text = String(req.body?.text || '').trim();
      if (!text) {
        return res.status(400).json({ error: 'text_required' });
      }

      const note = await serviceRepository.addInternalNote(request.id, {
        authorId: req.adminUser.id,
        authorRole: req.adminUser.role,
        text,
      });

      return res.status(201).json({ note });
    },
  };
}
