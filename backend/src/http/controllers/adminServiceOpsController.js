import { storeServiceMediaFile } from '../../infrastructure/repositories/serviceOpsRepository.js';
import {
  canApplyCommercialStatusForServiceStatus,
  canRoleTransitionCommercialStatus,
  canRoleTransitionServiceStatus,
} from '../../domain/serviceOpsWorkflowPolicy.js';

const ROLES = {
  dashboard: ['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director'],
  serviceView: ['manager', 'service_engineer', 'service_head', 'owner', 'director'],
  director: ['director', 'owner'],
  sales: ['sales_manager', 'manager', 'owner', 'director'],
};

function can(role, allow) {
  return allow.includes(role);
}

export function createAdminServiceOpsController(serviceOpsRepository, opts = {}) {
  const uploadsRoot = opts.uploadsRoot;

  return {
    async dashboard(req, res) {
      if (!can(req.adminUser?.role, ROLES.dashboard)) return res.status(403).json({ error: 'forbidden' });
      const metrics = await serviceOpsRepository.dashboard(req.query || {});
      return res.json(metrics);
    },

    async listServiceCases(req, res) {
      if (!can(req.adminUser?.role, ROLES.dashboard)) return res.status(403).json({ error: 'forbidden' });
      const items = await serviceOpsRepository.listServiceCases(req.query || {});
      return res.json({ items });
    },

    async byServiceCaseId(req, res) {
      const item = await serviceOpsRepository.getServiceCaseById(req.params.id);
      if (!item) return res.status(404).json({ error: 'not_found' });
      return res.json({ item });
    },

    async assign(req, res) {
      if (!can(req.adminUser?.role, ['service_head', 'manager', 'owner', 'director'])) return res.status(403).json({ error: 'forbidden' });
      const assignedToUserId = String(req.body?.assignedToUserId || '').trim();
      if (!assignedToUserId) return res.status(400).json({ error: 'assigned_to_user_required' });
      const item = await serviceOpsRepository.assignServiceCase(req.params.id, assignedToUserId, req.adminUser?.id || null);
      return res.json({ item });
    },

    async updateStatus(req, res) {
      const serviceStatus = String(req.body?.serviceStatus || '').trim();
      if (!serviceStatus) return res.status(400).json({ error: 'service_status_required' });

      const existing = await serviceOpsRepository.getServiceCaseById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'not_found' });

      if (!canRoleTransitionServiceStatus({ role: req.adminUser?.role, fromStatus: existing.serviceStatus, toStatus: serviceStatus })) {
        return res.status(403).json({ error: 'forbidden_transition' });
      }

      try {
        const item = await serviceOpsRepository.updateServiceCaseStatus(req.params.id, serviceStatus, {
          comment: req.body?.comment || null,
          actorLabel: req.adminUser?.fullName || req.adminUser?.email || req.adminUser?.id || 'admin',
          changedByUserId: req.adminUser?.id || null,
          processedByUserId: can(req.adminUser?.role, ROLES.director) && serviceStatus === 'processed' ? req.adminUser?.id : null,
          invoiceNumber: req.body?.invoiceNumber || undefined,
          invoiceStatus: req.body?.invoiceStatus || undefined,
        });
        if (!item) return res.status(404).json({ error: 'not_found' });
        return res.json({ item });
      } catch (error) {
        if (error?.message === 'invalid_transition') return res.status(400).json({ error: 'invalid_transition' });
        throw error;
      }
    },

    async addNote(req, res) {
      const body = String(req.body?.body || '').trim();
      if (!body) return res.status(400).json({ error: 'note_required' });
      const note = await serviceOpsRepository.addServiceCaseNote(req.params.id, {
        authorUserId: req.adminUser?.id || null,
        body,
        isInternal: req.body?.isInternal !== false,
      });
      return res.status(201).json({ note });
    },

    async addMedia(req, res) {
      const serviceCase = await serviceOpsRepository.getServiceCaseById(req.params.id);
      if (!serviceCase) return res.status(404).json({ error: 'not_found' });
      if (!req.files?.length) return res.status(400).json({ error: 'file_required' });
      const saved = [];
      for (const file of req.files) {
        const meta = await storeServiceMediaFile({ uploadsRoot, file });
        const row = await serviceOpsRepository.createMedia(req.params.id, {
          equipmentId: serviceCase.equipmentId,
          ...meta,
          uploadedByUserId: req.adminUser?.id || null,
          caption: String(req.body?.caption || '').trim() || null,
        });
        saved.push(row);
      }
      return res.status(201).json({ media: saved });
    },

    async history(req, res) {
      const history = await serviceOpsRepository.listServiceCaseHistory(req.params.id);
      return res.json({ history });
    },

    async listEquipment(req, res) {
      const items = await serviceOpsRepository.listEquipment(req.query || {});
      return res.json({ items });
    },

    async equipmentById(req, res) {
      const item = await serviceOpsRepository.getEquipmentById(req.params.id);
      if (!item) return res.status(404).json({ error: 'not_found' });
      return res.json({ item });
    },

    async updateCommercialStatus(req, res) {
      if (!can(req.adminUser?.role, ROLES.sales)) return res.status(403).json({ error: 'forbidden' });
      const commercialStatus = String(req.body?.commercialStatus || '').trim();
      if (!commercialStatus) return res.status(400).json({ error: 'commercial_status_required' });

      const equipment = await serviceOpsRepository.getEquipmentById(req.params.id);
      if (!equipment) return res.status(404).json({ error: 'not_found' });

      if (!canRoleTransitionCommercialStatus({
        role: req.adminUser?.role,
        fromStatus: equipment.commercialStatus || 'none',
        toStatus: commercialStatus,
      })) {
        return res.status(403).json({ error: 'forbidden_transition' });
      }

      const lastServiceCase = req.body?.serviceCaseId
        ? await serviceOpsRepository.getServiceCaseById(req.body.serviceCaseId)
        : null;
      const effectiveServiceStatus = lastServiceCase?.serviceStatus || equipment.serviceStatus;
      if (!canApplyCommercialStatusForServiceStatus({ serviceStatus: effectiveServiceStatus, commercialStatus })) {
        return res.status(400).json({ error: 'service_status_not_processed' });
      }

      const item = await serviceOpsRepository.updateEquipmentCommercialStatus(req.params.id, commercialStatus, {
        comment: req.body?.comment || null,
        changedByUserId: req.adminUser?.id || null,
        actorLabel: req.adminUser?.fullName || req.adminUser?.id || 'admin',
        serviceCaseId: req.body?.serviceCaseId || null,
      });
      if (!item) return res.status(404).json({ error: 'not_found' });
      return res.json({ item });
    },

    async equipmentServiceCases(req, res) {
      const items = await serviceOpsRepository.listEquipmentServiceCases(req.params.id);
      return res.json({ items });
    },
  };
}
