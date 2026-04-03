const ALLOWED_STATUSES = ['new', 'in_progress', 'resolved', 'closed'];

const STATUS_TRANSITIONS = {
  service_engineer: {
    new: ['in_progress'],
    in_progress: ['resolved'],
    resolved: ['in_progress'],
    closed: [],
  },
  service_head: {
    new: ['in_progress', 'resolved', 'closed'],
    in_progress: ['resolved', 'closed'],
    resolved: ['in_progress', 'closed'],
    closed: [],
  },
};

function normalizeStatus(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return ALLOWED_STATUSES.includes(normalized) ? normalized : null;
}

function serviceScopeForUser(user) {
  if (user.role === 'service_engineer') {
    return { serviceOnly: true, assignedToUserId: user.id };
  }
  if (user.role === 'service_head') {
    return { serviceOnly: true };
  }
  return {};
}

function canEditRequest(user, request) {
  if (!request) return false;
  if (['owner', 'director', 'service_head'].includes(user.role)) return true;
  if (user.role === 'service_engineer') {
    return request.category === 'service_repair' && request.assignedToUserId === user.id;
  }
  return false;
}

function canTransition(role, currentStatus, nextStatus) {
  if (['owner', 'director'].includes(role)) return true;
  const matrix = STATUS_TRANSITIONS[role] || {};
  return (matrix[currentStatus] || []).includes(nextStatus);
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
      const requests = await serviceRepository.listForAdmin(
        { status, id, client, equipment },
        serviceScopeForUser(req.adminUser),
      );
      return res.json({ requests });
    },

    async byId(req, res) {
      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      if (!canEditRequest(req.adminUser, request)) {
        return res.status(403).json({ error: 'forbidden' });
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
      if (!canEditRequest(req.adminUser, request)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      if (!canTransition(req.adminUser.role, request.status, nextStatus)) {
        return res.status(400).json({ error: 'status_transition_forbidden' });
      }

      const updated = await serviceRepository.updateStatus(request.id, nextStatus, {
        changedByUserId: req.adminUser?.id || null,
        changedByRole: req.adminUser?.role || null,
        comment: comment || null,
      });
      return res.json({ request: updated });
    },

    async assign(req, res) {
      if (!['service_head', 'owner', 'director'].includes(req.adminUser.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      if (request.category !== 'service_repair') {
        return res.status(400).json({ error: 'assignment_allowed_for_service_only' });
      }

      const assignedToUserId = String(req.body?.assignedToUserId || '').trim() || null;
      const updated = await serviceRepository.assign(request.id, assignedToUserId, {
        changedByUserId: req.adminUser.id,
        changedByRole: req.adminUser.role,
      });
      return res.json({ request: updated });
    },

    async history(req, res) {
      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      if (!canEditRequest(req.adminUser, request)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const history = await serviceRepository.listHistory(request.id);
      return res.json({ history });
    },

    async notes(req, res) {
      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      if (!canEditRequest(req.adminUser, request)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const notes = await serviceRepository.listInternalNotes(request.id);
      return res.json({ notes });
    },

    async addNote(req, res) {
      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      if (!canEditRequest(req.adminUser, request)) {
        return res.status(403).json({ error: 'forbidden' });
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
