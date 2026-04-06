import { enrichServiceRequestMedia } from '../utils/serviceRequestMediaView.js';
import { normalizeRequestType, REQUEST_DEPARTMENTS, REQUEST_TYPES } from '../../domain/entities/requestTypes.js';
import { normalizeServiceRequestStatus } from '../../domain/workflow/serviceRequestStatuses.js';
const ALLOWED_SORT = ['urgency', 'createdAt', 'updatedAt'];

function normalizeStatus(value) {
  return normalizeServiceRequestStatus(value);
}

function normalizeSort(value) {
  if (!value) return 'createdAt';
  const normalized = String(value).trim();
  return ALLOWED_SORT.includes(normalized) ? normalized : 'createdAt';
}

export function createAdminServiceController(serviceRepository) {
  const ASSIGNMENT_ALLOWED_ROLES = ['service_head', 'manager'];

  function canAssign(role) {
    return ASSIGNMENT_ALLOWED_ROLES.includes(role);
  }

  function scopeFiltersByRole(role, userId, filters = {}) {
    if (role === 'service_engineer') {
      return {
        ...filters,
        type: REQUEST_TYPES.serviceRepair,
        assignedDepartment: REQUEST_DEPARTMENTS.service,
        assignedToUserId: userId,
      };
    }
    if (role === 'service_head' || role === 'manager') {
      return { ...filters, type: REQUEST_TYPES.serviceRepair, assignedDepartment: REQUEST_DEPARTMENTS.service };
    }
    if (role === 'sales_manager') return { ...filters, assignedDepartment: REQUEST_DEPARTMENTS.sales };
    return filters;
  }

  function isVisibleToRole(role, userId, request) {
    const scoped = scopeFiltersByRole(role, userId, {});
    if (scoped.type && request.type !== scoped.type) return false;
    if (scoped.assignedDepartment && request.assignedDepartment !== scoped.assignedDepartment) return false;
    if (scoped.assignedToUserId && request.assignedToUserId !== scoped.assignedToUserId) return false;
    return true;
  }

  function canManageAssignment(role) {
    return role === 'service_head' || role === 'manager';
  }

  return {
    async list(req, res) {
      const status = normalizeStatus(req.query?.status);
      if (req.query?.status && !status) {
        return res.status(400).json({ error: 'invalid_status' });
      }

      const type = normalizeRequestType(req.query?.type);
      if (req.query?.type && !type) {
        return res.status(400).json({ error: 'invalid_type' });
      }

      const id = String(req.query?.id || '').trim() || null;
      const client = String(req.query?.client || '').trim() || null;
      const equipment = String(req.query?.equipment || '').trim() || null;
      const engineer = String(req.query?.engineer || '').trim() || null;
      const sort = normalizeSort(req.query?.sort);
      const scopedFilters = scopeFiltersByRole(req.adminUser?.role, req.adminUser?.id, { status, id, client, equipment, type, assignedToUserId: engineer, sort });
      const requests = await serviceRepository.listForAdmin(scopedFilters);
      return res.json({ requests: requests.map((item) => enrichServiceRequestMedia(req, item)) });
    },

    async dashboard(req, res) {
      const status = normalizeStatus(req.query?.status);
      const type = normalizeRequestType(req.query?.type);
      const engineer = String(req.query?.engineer || '').trim() || null;
      const scopedFilters = scopeFiltersByRole(req.adminUser?.role, req.adminUser?.id, { status, type, assignedToUserId: engineer });
      const metrics = await serviceRepository.getDashboardMetrics(scopedFilters);
      return res.json(metrics);
    },

    async byId(req, res) {
      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      if (!isVisibleToRole(req.adminUser?.role, req.adminUser?.id, request)) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      return res.json({ request: enrichServiceRequestMedia(req, request) });
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
      if (!isVisibleToRole(req.adminUser?.role, req.adminUser?.id, request)) {
        return res.status(404).json({ error: 'request_not_found' });
      }

      const updated = await serviceRepository.updateStatus(request.id, nextStatus, {
        changedByUserId: req.adminUser?.id || null,
        changedByRole: req.adminUser?.role || null,
        comment: comment || null,
      });
      return res.json({ request: enrichServiceRequestMedia(req, updated) });
    },

    async listServiceEngineers(req, res) {
      if (!canAssign(req.adminUser?.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const engineers = await serviceRepository.listServiceEngineersWithWorkload();
      return res.json({ engineers });
    },

    async assignManager(req, res) {
      if (!canAssign(req.adminUser?.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      if (!isVisibleToRole(req.adminUser?.role, req.adminUser?.id, request)) {
        return res.status(404).json({ error: 'request_not_found' });
      }

      const userId = String(req.body?.assignedToUserId || '').trim();
      const comment = String(req.body?.comment || '').trim() || null;
      if (!userId) {
        return res.status(400).json({ error: 'assigned_to_user_required' });
      }
      const updated = await serviceRepository.assignToUser(request.id, userId, {
        assignedByUserId: req.adminUser?.id,
        comment,
      });
      return res.json({ request: enrichServiceRequestMedia(req, updated) });
    },

    async history(req, res) {
      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      if (!isVisibleToRole(req.adminUser?.role, req.adminUser?.id, request)) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      const history = await serviceRepository.listHistory(request.id);
      return res.json({ history });
    },

    async assignmentHistory(req, res) {
      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      if (!isVisibleToRole(req.adminUser?.role, req.adminUser?.id, request)) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      const history = await serviceRepository.listAssignmentHistory(request.id);
      return res.json({ history });
    },

    async notes(req, res) {
      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      if (!isVisibleToRole(req.adminUser?.role, req.adminUser?.id, request)) {
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
      if (!isVisibleToRole(req.adminUser?.role, req.adminUser?.id, request)) {
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
