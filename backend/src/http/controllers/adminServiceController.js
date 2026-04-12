import { enrichServiceRequestMedia } from '../utils/serviceRequestMediaView.js';
import { normalizeRequestType, REQUEST_DEPARTMENTS, REQUEST_TYPES } from '../../domain/entities/requestTypes.js';
import { normalizeServiceRequestStatus } from '../../domain/workflow/serviceRequestStatuses.js';
import { storeServiceMediaFile } from '../../infrastructure/repositories/serviceOpsRepository.js';
import { uploadServiceRequestMedia } from '../../infrastructure/drive/gasDriveClient.js';
import { validateUploadedMediaFiles } from '../utils/uploadedMediaValidation.js';
const ALLOWED_SORT = ['urgency', 'createdAt', 'updatedAt'];
const ALLOWED_CATEGORIES = new Set(['coffee_machine', 'grinder', 'water']);
const ALLOWED_URGENCY = new Set(['low', 'normal', 'high', 'critical']);
const WORKFLOW = {
  new: ['assigned', 'taken_in_work', 'cancelled'],
  assigned: ['taken_in_work', 'cancelled'],
  taken_in_work: ['ready_for_qc', 'cancelled'],
  ready_for_qc: ['on_service_head_control', 'taken_in_work', 'cancelled'],
  on_service_head_control: ['to_director', 'taken_in_work', 'cancelled'],
  to_director: ['invoiced', 'taken_in_work', 'cancelled'],
  invoiced: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
};
const MEDIA_STAGE_TYPES = new Set(['before_photo', 'before_video', 'after_photo', 'after_video']);

function normalizeStatus(value) {
  return normalizeServiceRequestStatus(value);
}

function normalizeSort(value) {
  if (!value) return 'createdAt';
  const normalized = String(value).trim();
  return ALLOWED_SORT.includes(normalized) ? normalized : 'createdAt';
}

export function createAdminServiceController(serviceRepository, options = {}) {
  const uploadsRoot = options.uploadsRoot;
  const equipmentRepository = options.equipmentRepository;
  const clientRepository = options.clientRepository;
  const serviceRequestEvents = options.serviceRequestEvents;
  const ASSIGNMENT_ALLOWED_ROLES = ['service_head', 'manager'];
  const SERVICE_ENGINEERS_VIEW_ALLOWED_ROLES = ['service_head', 'manager', 'owner', 'director'];
  const STATUS_UPDATE_ALLOWED_ROLES = ['service_engineer', 'service_head', 'manager', 'owner', 'director', 'sales_manager'];
  const DELETE_ALLOWED_ROLES = ['service_head', 'owner', 'director'];
  const CREATE_ALLOWED_ROLES = ['service_head', 'manager', 'owner', 'director'];

  function canAssign(role) {
    return ASSIGNMENT_ALLOWED_ROLES.includes(role);
  }

  function canViewServiceEngineers(role) {
    return SERVICE_ENGINEERS_VIEW_ALLOWED_ROLES.includes(role);
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

  function canTransition(role, request, nextStatus, userId) {
    if (!STATUS_UPDATE_ALLOWED_ROLES.includes(role)) return false;
    const current = String(request?.status || '').trim().toLowerCase();
    if (!WORKFLOW[current]?.includes(nextStatus)) return false;

    if (role === 'service_engineer') {
      const isOwn = request.assignedToUserId === userId;
      const isFreeToTake = !request.assignedToUserId && ['new', 'assigned'].includes(current) && nextStatus === 'taken_in_work';
      return isOwn || isFreeToTake;
    }

    if (role === 'sales_manager') {
      return nextStatus === 'closed' && current === 'invoiced';
    }

    if (role === 'director') {
      return ['invoiced', 'cancelled'].includes(nextStatus) && current === 'to_director';
    }

    return true;
  }

  function canDeleteRequest(role) {
    return DELETE_ALLOWED_ROLES.includes(role);
  }

  function canCreateRequest(role) {
    return CREATE_ALLOWED_ROLES.includes(role);
  }

  function normalizeMediaType(stage, mimeType) {
    const kind = String(mimeType || '').toLowerCase().startsWith('video/') ? 'video' : 'photo';
    const normalizedStage = String(stage || '').trim().toLowerCase();
    if (MEDIA_STAGE_TYPES.has(normalizedStage)) return normalizedStage;
    return `${normalizedStage === 'after' ? 'after' : 'before'}_${kind}`;
  }

  function emitRequestChanged(type, request) {
    serviceRequestEvents?.emitChange?.({
      type,
      requestId: request?.id || null,
      status: request?.status || null,
    });
  }

  return {
    async events(req, res) {
      if (!serviceRequestEvents?.onChange) {
        return res.status(503).json({ error: 'events_unavailable' });
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, at: new Date().toISOString() })}\n\n`);

      const unsubscribe = serviceRequestEvents.onChange((event) => {
        res.write(`event: service-request\ndata: ${JSON.stringify(event)}\n\n`);
      });
      const heartbeat = setInterval(() => {
        res.write(`event: ping\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
      }, 25000);

      req.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
      return undefined;
    },

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

    async create(req, res) {
      if (!canCreateRequest(req.adminUser?.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const type = normalizeRequestType(req.body?.type || REQUEST_TYPES.serviceRepair) || REQUEST_TYPES.serviceRepair;
      const equipmentId = String(req.body?.equipmentId || '').trim();
      const selectedClientId = String(req.body?.clientId || '').trim() || null;
      const selectedLocationId = String(req.body?.locationId || '').trim() || null;
      const companyName = String(req.body?.companyName || '').trim();
      const contactName = String(req.body?.contactName || '').trim();
      const phone = String(req.body?.phone || '').trim();
      const locationName = String(req.body?.locationName || '').trim();
      const locationAddress = String(req.body?.locationAddress || '').trim();
      const category = String(req.body?.category || '').trim().toLowerCase();
      const description = String(req.body?.description || '').trim();
      const title = String(req.body?.title || '').trim() || description.slice(0, 100) || 'Новая заявка';
      const urgency = String(req.body?.urgency || 'normal').trim().toLowerCase();
      const canOperateNow = String(req.body?.canOperateNow ?? 'true').trim().toLowerCase();
      const assignedToUserId = String(req.body?.assignedToUserId || '').trim() || null;

      if (!description) {
        return res.status(400).json({ error: 'description_required' });
      }
      const mediaValidationError = validateUploadedMediaFiles(req.files || []);
      if (mediaValidationError) {
        return res.status(400).json({ error: mediaValidationError });
      }
      if (!ALLOWED_CATEGORIES.has(category)) {
        return res.status(400).json({ error: 'category_required' });
      }
      if (!ALLOWED_URGENCY.has(urgency)) {
        return res.status(400).json({ error: 'urgency_required' });
      }

      let equipment = null;
      let clientId = selectedClientId;
      let locationId = selectedLocationId;

      if (equipmentId) {
        equipment = equipmentRepository ? await equipmentRepository.findById(equipmentId) : null;
        if (!equipment) {
          return res.status(400).json({ error: 'equipment_not_found' });
        }
        if (!equipment.clientId) {
          return res.status(400).json({ error: 'equipment_client_required' });
        }
        clientId = equipment.clientId;
        locationId = equipment.locationId || locationId || null;
      } else if (!clientId) {
        if (!companyName) {
          return res.status(400).json({ error: 'company_name_required' });
        }
        const createdContext = clientRepository?.createAdminLeadContext
          ? await clientRepository.createAdminLeadContext({ companyName, contactName, phone, locationName, locationAddress })
          : null;
        if (!createdContext?.client?.id) {
          return res.status(400).json({ error: 'client_context_required' });
        }
        clientId = createdContext.client.id;
        locationId = createdContext.location?.id || null;
      }

      const requestId = `req-${Date.now()}`;
      const uploadedMedia = [];
      for (const file of req.files || []) {
        const uploaded = await uploadServiceRequestMedia({ entityId: requestId, file });
        uploadedMedia.push(uploaded);
      }

      const created = await serviceRepository.create({
        id: requestId,
        type,
        title,
        description,
        equipmentId: equipment?.id || null,
        clientId,
        locationId: locationId || null,
        pointUserId: null,
        category,
        urgency,
        canOperateNow: ['1', 'true', 'yes', 'on'].includes(canOperateNow),
        assignedDepartment: REQUEST_DEPARTMENTS.service,
        source: 'admin_manual',
        assignedToUserId,
        assignedByUserId: assignedToUserId ? req.adminUser?.id || null : null,
        status: assignedToUserId ? 'assigned' : 'new',
        media: uploadedMedia,
      });

      emitRequestChanged('created', created);
      return res.status(201).json({ request: enrichServiceRequestMedia(req, created) });
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

    async deleteById(req, res) {
      if (!canDeleteRequest(req.adminUser?.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      if (!isVisibleToRole(req.adminUser?.role, req.adminUser?.id, request)) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      await serviceRepository.deleteById(request.id);
      emitRequestChanged('deleted', request);
      return res.status(204).send();
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
      if (!canTransition(req.adminUser?.role, request, nextStatus, req.adminUser?.id)) {
        return res.status(403).json({ error: 'transition_not_allowed' });
      }

      if (req.adminUser?.role === 'service_engineer' && !request.assignedToUserId && nextStatus === 'taken_in_work') {
        await serviceRepository.assignToUser(request.id, req.adminUser.id, {
          assignedByUserId: req.adminUser.id,
          comment: 'Engineer self-assigned from board',
        });
      }

      const updated = await serviceRepository.updateStatus(request.id, nextStatus, {
        changedByUserId: req.adminUser?.id || null,
        changedByRole: req.adminUser?.role || null,
        comment: comment || null,
      });
      emitRequestChanged('status_changed', updated);
      return res.json({ request: enrichServiceRequestMedia(req, updated) });
    },

    async listServiceEngineers(req, res) {
      if (!canViewServiceEngineers(req.adminUser?.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const engineers = await serviceRepository.listServiceEngineersWithWorkload();
      return res.json({ engineers });
    },

    async assignManager(req, res) {
      const isSelfTake = req.adminUser?.role === 'service_engineer';
      if (!canAssign(req.adminUser?.role) && !isSelfTake) {
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
      if (isSelfTake && userId !== req.adminUser?.id) {
        return res.status(403).json({ error: 'engineer_can_assign_only_self' });
      }
      const updated = await serviceRepository.assignToUser(request.id, userId, {
        assignedByUserId: req.adminUser?.id,
        comment,
      });
      emitRequestChanged('assigned', updated);
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

      emitRequestChanged('note_added', request);
      return res.status(201).json({ note });
    },

    async addMedia(req, res) {
      const request = await serviceRepository.findForAdminById(req.params.id);
      if (!request) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      if (!isVisibleToRole(req.adminUser?.role, req.adminUser?.id, request)) {
        return res.status(404).json({ error: 'request_not_found' });
      }
      if (!req.files?.length) {
        return res.status(400).json({ error: 'media_required' });
      }
      const mediaValidationError = validateUploadedMediaFiles(req.files || [], { required: true });
      if (mediaValidationError) {
        return res.status(400).json({ error: mediaValidationError });
      }

      const mediaStage = String(req.body?.mediaStage || 'before').trim().toLowerCase();
      const rows = await Promise.all((req.files || []).map(async (file) => {
        const meta = await storeServiceMediaFile({ uploadsRoot, file, prefix: 'service-requests' });
        return {
          id: `srm-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          type: normalizeMediaType(mediaStage, file.mimetype),
          fileId: null,
          fileUrl: meta.fileUrl,
          previewUrl: meta.fileUrl,
          mimeType: file.mimetype || '',
          originalName: file.originalname || '',
          size: Number(file.size || 0),
        };
      }));

      const updated = await serviceRepository.addMedia(request.id, rows);
      emitRequestChanged('media_added', updated);
      return res.status(201).json({ request: enrichServiceRequestMedia(req, updated) });
    },
  };
}
