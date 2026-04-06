import { storeServiceMediaFile } from '../../infrastructure/repositories/serviceOpsRepository.js';
import { PERMISSIONS } from '../../domain/workflow/permissions.js';
import {
  canAssignServiceCase,
  canChangeServiceStatus,
  evaluateServiceStatusChange,
  evaluateCommercialStatusChange,
  hasPermission,
} from '../../domain/workflow/serviceWorkflowGuards.js';
import { getAllowedServiceTransitions } from '../../domain/workflow/serviceTransitions.js';
import { getAllowedCommercialTransitions } from '../../domain/workflow/commercialTransitions.js';
import { buildEquipmentTimeline, normalizeEquipmentMedia } from '../utils/equipmentDetailView.js';

function can(user, permission) {
  return hasPermission(user, permission);
}

function csvEscape(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
  return raw;
}

function toCsv(columns, rows) {
  const normalizedColumns = [...columns];
  const header = normalizedColumns.map((col) => csvEscape(col.label)).join(',');
  const body = (rows || []).map((row) => normalizedColumns.map((col) => csvEscape(row[col.key])).join(',')).join('\r\n');
  return `\uFEFF${header}\r\n${body}`;
}

function filterAlertsByRole(alertState = {}, role = '') {
  if (role === 'owner') return alertState;
  if (role === 'director') {
    const allowed = ['stale_ready', 'overdue_by_stage', 'stale_reserved'];
    const alerts = (alertState.alerts || []).filter((item) => allowed.includes(item.type));
    return { ...alertState, alerts };
  }
  return { ...alertState, alerts: [] };
}

function buildNextActions({ serviceStatus, commercialStatus, serviceActions = [], commercialActions = [] }) {
  const normalizedServiceStatus = String(serviceStatus || '').trim().toLowerCase();
  const normalizedCommercialStatus = String(commercialStatus || 'none').trim().toLowerCase() || 'none';

  const actions = [];
  const serviceActionMeta = {
    in_progress: { key: 'take_in_work', label: 'Take in work' },
    testing: { key: 'move_to_testing', label: 'Move to testing' },
    ready: { key: 'mark_ready', label: 'Mark ready' },
    processed: { key: 'process', label: 'Process' },
    closed: { key: 'close', label: 'Close case' },
  };
  for (const targetStatus of serviceActions) {
    const meta = serviceActionMeta[targetStatus] || { key: `service_${targetStatus}`, label: `Move to ${targetStatus}` };
    actions.push({ key: meta.key, type: 'service', targetStatus, label: meta.label });
  }

  const commercialActionMeta = {
    ready_for_issue: { key: 'route_to_issue', label: 'Route to issue' },
    ready_for_rent: { key: 'route_to_rent', label: 'Route to rent' },
    ready_for_sale: { key: 'route_to_sale', label: 'Route to sale' },
    reserved_for_rent: { key: 'reserve-rent', label: 'Reserve rent' },
    reserved_for_sale: { key: 'reserve-sale', label: 'Reserve sale' },
    out_on_rent: { key: 'mark_out_on_rent', label: 'Mark out on rent' },
    out_on_replacement: { key: 'mark_out_on_replacement', label: 'Mark out on replacement' },
    sold: { key: 'mark_sold', label: 'Mark sold' },
    issued_to_client: { key: 'mark_issued', label: 'Mark issued' },
  };
  for (const targetStatus of commercialActions) {
    const meta = commercialActionMeta[targetStatus] || { key: `commercial_${targetStatus}`, label: `Move to ${targetStatus}` };
    actions.push({ key: meta.key, type: 'commercial', targetStatus, label: meta.label });
  }

  return {
    service: serviceActions,
    commercial: commercialActions,
    all: actions,
    boardStatus: {
      service: normalizedServiceStatus,
      commercial: normalizedCommercialStatus,
    },
  };
}

export function createAdminServiceOpsController(serviceOpsRepository, opts = {}) {
  const uploadsRoot = opts.uploadsRoot;
  const notificationCenterService = opts.notificationCenterService;

  async function applyCommercialStatusChange(req, res, {
    equipmentId,
    serviceStatus,
    fromCommercialStatus,
    toCommercialStatus,
    serviceCaseId = null,
    actorFallback = 'admin',
  }) {
    const decision = evaluateCommercialStatusChange(
      req.adminUser,
      serviceStatus,
      fromCommercialStatus,
      toCommercialStatus,
    );
    if (!decision.allowed) {
      if (decision.reason === 'invalid_transition' || decision.reason === 'service_status_not_processed') {
        return res.status(409).json({ error: decision.reason });
      }
      return res.status(403).json({ error: decision.reason || 'forbidden_transition' });
    }

    const item = await serviceOpsRepository.updateEquipmentCommercialStatus(equipmentId, toCommercialStatus, {
      comment: req.body?.comment || null,
      changedByUserId: req.adminUser?.id || null,
      actorLabel: req.adminUser?.fullName || req.adminUser?.id || actorFallback,
      serviceCaseId,
    });
    if (!item) return res.status(404).json({ error: 'not_found' });
    return res.json({ item });
  }

  return {
    async dashboard(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceDashboardRead)) return res.status(403).json({ error: 'forbidden' });
      const metrics = await serviceOpsRepository.dashboard(req.query || {});
      return res.json(metrics);
    },

    async serviceKpi(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceDashboardRead)) return res.status(403).json({ error: 'forbidden' });
      const metrics = await serviceOpsRepository.dashboard(req.query || {});
      return res.json(metrics);
    },

    async executiveSummary(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceDashboardRead)) return res.status(403).json({ error: 'forbidden' });
      const metrics = await serviceOpsRepository.dashboard(req.query || {});
      const scopedAlerts = filterAlertsByRole(metrics.alerts || {}, req.adminUser?.role || '');
      return res.json({
        generatedAt: new Date().toISOString(),
        summary: {
          service: metrics.roleAnalytics?.service || {},
          director: metrics.roleAnalytics?.director || {},
          sales: metrics.roleAnalytics?.sales || {},
          sla: metrics.slaAging || {},
        },
        alerts: scopedAlerts,
        escalationBlocks: scopedAlerts.escalationBlocks || {},
        recentCriticalChanges: scopedAlerts.recentCriticalChanges || [],
        notifications: metrics.notifications || { preview: { pendingCritical: 0, pendingWarning: 0, digestSize: 0 } },
        notificationCenter: metrics.executiveDashboard || {},
      });
    },

    async alerts(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceDashboardRead)) return res.status(403).json({ error: 'forbidden' });
      const metrics = await serviceOpsRepository.dashboard(req.query || {});
      return res.json(filterAlertsByRole(metrics.alerts || {}, req.adminUser?.role || ''));
    },

    async notificationsPreview(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceDashboardRead)) return res.status(403).json({ error: 'forbidden' });
      const metrics = await serviceOpsRepository.dashboard(req.query || {});
      const alertState = filterAlertsByRole(metrics.alerts || {}, req.adminUser?.role || '');
      const preview = await opts.executiveNotifier?.triggerDigest({ roles: [], alertState, metrics })
        .then((x) => ({ templates: x.templates, generatedAt: x.generatedAt }))
        .catch(() => ({ templates: {}, generatedAt: new Date().toISOString() }));
      const schedule = notificationCenterService?.buildSchedulePlan(new Date()) || null;
      return res.json({
        generatedAt: preview.generatedAt,
        notificationPreview: metrics.notifications?.preview || { pendingCritical: 0, pendingWarning: 0, digestSize: 0 },
        templates: preview.templates,
        schedule,
      });
    },

    async notificationsTrigger(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceDashboardRead)) return res.status(403).json({ error: 'forbidden' });
      const roles = Array.isArray(req.body?.roles) ? req.body.roles : [];
      if (!notificationCenterService) return res.status(503).json({ error: 'notifier_unavailable' });
      const result = await notificationCenterService.runDigest({ digestType: 'manual_digest', roles, trigger: 'manual' });
      return res.json(result);
    },

    async notificationCenter(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceDashboardRead)) return res.status(403).json({ error: 'forbidden' });
      const metrics = await serviceOpsRepository.dashboard(req.query || {});
      return res.json({
        generatedAt: new Date().toISOString(),
        lastSentNotifications: metrics.executiveDashboard?.lastSentNotifications || [],
        deliveryState: metrics.executiveDashboard?.deliveryState || {},
        nextScheduledDigest: metrics.executiveDashboard?.nextScheduledDigest || {},
        topWorseningBottlenecks: metrics.executiveDashboard?.topWorseningBottlenecks || [],
      });
    },

    async scheduledDigestPlan(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceDashboardRead)) return res.status(403).json({ error: 'forbidden' });
      if (!notificationCenterService) return res.status(503).json({ error: 'notifier_unavailable' });
      return res.json(notificationCenterService.buildSchedulePlan(new Date()));
    },

    async scheduledDigestRun(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceDashboardRead)) return res.status(403).json({ error: 'forbidden' });
      if (!notificationCenterService) return res.status(503).json({ error: 'notifier_unavailable' });
      const includeWeekly = Boolean(req.body?.includeWeekly);
      const result = await notificationCenterService.runScheduledDigests({ includeWeekly });
      return res.json(result);
    },

    async exportServiceCases(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceCaseRead)) return res.status(403).json({ error: 'forbidden' });
      const rows = await serviceOpsRepository.listServiceCases(req.query || {});
      const csv = toCsv([
        { key: 'id', label: 'id' },
        { key: 'serviceStatus', label: 'service_status' },
        { key: 'assignedToUserId', label: 'assigned_to' },
        { key: 'createdAt', label: 'created_at' },
        { key: 'updatedAt', label: 'updated_at' },
        { key: 'equipmentId', label: 'equipment_id' },
      ], rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=\"service-cases.csv\"');
      await serviceOpsRepository.createReportExportHistory?.({
        reportType: 'service_cases',
        format: 'csv',
        triggerType: req.query?.trigger === 'scheduled' ? 'scheduled' : 'manual',
        requestedByRole: req.adminUser?.role || null,
        requestedByUserId: req.adminUser?.id || null,
        filtersJson: JSON.stringify(req.query || {}),
        status: 'success',
      });
      return res.send(csv);
    },

    async exportExecutiveSummary(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceDashboardRead)) return res.status(403).json({ error: 'forbidden' });
      const metrics = await serviceOpsRepository.dashboard(req.query || {});
      const flatRows = [
        { metric: 'service.avg_assign_minutes', value: metrics.roleAnalytics?.service?.avgAssignTimeMinutes || 0 },
        { metric: 'service.avg_repair_minutes', value: metrics.roleAnalytics?.service?.avgRepairTimeMinutes || 0 },
        { metric: 'director.ready_aging', value: metrics.roleAnalytics?.director?.readyAgingCount || 0 },
        { metric: 'sales.rent_backlog', value: metrics.roleAnalytics?.sales?.rentBacklogCount || 0 },
        { metric: 'alerts.critical', value: metrics.alerts?.summary?.critical || 0 },
      ];
      const csv = toCsv([{ key: 'metric', label: 'metric' }, { key: 'value', label: 'value' }], flatRows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=\"executive-summary.csv\"');
      await serviceOpsRepository.createReportExportHistory?.({
        reportType: 'executive_summary',
        format: 'csv',
        triggerType: req.query?.trigger === 'scheduled' ? 'scheduled' : 'manual',
        requestedByRole: req.adminUser?.role || null,
        requestedByUserId: req.adminUser?.id || null,
        filtersJson: JSON.stringify(req.query || {}),
        status: 'success',
      });
      return res.send(csv);
    },

    async exportSalesFlow(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceCaseRead)) return res.status(403).json({ error: 'forbidden' });
      const rows = await serviceOpsRepository.listEquipment(req.query || {});
      const csv = toCsv([
        { key: 'id', label: 'id' },
        { key: 'commercialStatus', label: 'commercial_status' },
        { key: 'ownerType', label: 'owner_type' },
        { key: 'updatedAt', label: 'updated_at' },
        { key: 'internalNumber', label: 'internal_number' },
      ], rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=\"sales-flow.csv\"');
      await serviceOpsRepository.createReportExportHistory?.({
        reportType: 'sales_flow',
        format: 'csv',
        triggerType: req.query?.trigger === 'scheduled' ? 'scheduled' : 'manual',
        requestedByRole: req.adminUser?.role || null,
        requestedByUserId: req.adminUser?.id || null,
        filtersJson: JSON.stringify(req.query || {}),
        status: 'success',
      });
      return res.send(csv);
    },

    async weeklyExecutiveReport(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceDashboardRead)) return res.status(403).json({ error: 'forbidden' });
      const metrics = await serviceOpsRepository.dashboard(req.query || {});
      return res.json({
        generatedAt: new Date().toISOString(),
        period: 'weekly',
        payload: metrics.weeklyExecutiveReport || {},
      });
    },

    async reportExportHistory(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceDashboardRead)) return res.status(403).json({ error: 'forbidden' });
      const limit = Number(req.query?.limit || 25);
      const items = await serviceOpsRepository.listReportExportHistory?.({ limit }) || [];
      return res.json({ items });
    },

    async reportPresets(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceDashboardRead)) return res.status(403).json({ error: 'forbidden' });
      const reportType = req.query?.reportType ? String(req.query.reportType) : undefined;
      const items = await serviceOpsRepository.listReportPresets?.({ reportType, ownerRole: req.adminUser?.role || null }) || [];
      return res.json({ items });
    },

    async saveReportPreset(req, res) {
      if ((req.adminUser?.role || '') !== 'owner') return res.status(403).json({ error: 'forbidden' });
      const payload = {
        key: String(req.body?.key || '').trim(),
        title: String(req.body?.title || '').trim() || 'Preset',
        reportType: String(req.body?.reportType || 'service_cases'),
        filtersJson: JSON.stringify(req.body?.filters || {}),
        ownerRole: req.body?.ownerRole ? String(req.body.ownerRole) : null,
        ownerUserId: req.body?.ownerUserId ? String(req.body.ownerUserId) : null,
        createdByUserId: req.adminUser?.id || null,
      };
      const item = await serviceOpsRepository.saveReportPreset?.(payload);
      return res.json({ item });
    },

    async listServiceCases(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceCaseRead)) return res.status(403).json({ error: 'forbidden' });
      const items = await serviceOpsRepository.listServiceCases(req.query || {});
      return res.json({ items });
    },

    async byServiceCaseId(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceCaseRead)) return res.status(403).json({ error: 'forbidden' });
      const item = await serviceOpsRepository.getServiceCaseById(req.params.id);
      if (!item) return res.status(404).json({ error: 'not_found' });
      const serviceActions = Object.keys(getAllowedServiceTransitions(item.serviceStatus || ''))
        .filter((toStatus) => canChangeServiceStatus(req.adminUser, item.serviceStatus, toStatus));
      const commercialActions = Object.keys(getAllowedCommercialTransitions(item.equipment?.commercialStatus || 'none'))
        .filter((toStatus) => evaluateCommercialStatusChange(req.adminUser, item.serviceStatus, item.equipment?.commercialStatus || 'none', toStatus).allowed);
      const nextActions = buildNextActions({
        serviceStatus: item.serviceStatus,
        commercialStatus: item.equipment?.commercialStatus || 'none',
        serviceActions,
        commercialActions,
      });
      return res.json({
        item: {
          ...item,
          invoiceIssued: ['issued', 'paid'].includes(String(item.invoiceStatus || '').toLowerCase()),
          availableServiceActions: serviceActions,
          availableCommercialActions: commercialActions,
          availableActions: nextActions.all,
          nextActions,
        },
      });
    },

    async assign(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceCaseAssign)) return res.status(403).json({ error: 'forbidden' });
      const assignedToUserId = String(req.body?.assignedToUserId || '').trim();
      if (!assignedToUserId) return res.status(400).json({ error: 'assigned_to_user_required' });

      const existing = await serviceOpsRepository.getServiceCaseById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'not_found' });
      if (!canAssignServiceCase(req.adminUser, existing)) return res.status(403).json({ error: 'forbidden' });

      const item = await serviceOpsRepository.assignServiceCase(req.params.id, assignedToUserId, req.adminUser?.id || null);
      return res.json({ item });
    },

    async updateStatus(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceCaseUpdateStatus)) return res.status(403).json({ error: 'forbidden' });
      const serviceStatus = String(req.body?.serviceStatus || '').trim();
      if (!serviceStatus) return res.status(400).json({ error: 'service_status_required' });

      const existing = await serviceOpsRepository.getServiceCaseById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'not_found' });

      const decision = evaluateServiceStatusChange(req.adminUser, existing.serviceStatus, serviceStatus);
      if (!decision.allowed) {
        if (decision.reason === 'invalid_transition') return res.status(409).json({ error: 'invalid_transition' });
        return res.status(403).json({ error: decision.reason || 'forbidden_transition' });
      }

      try {
        const item = await serviceOpsRepository.updateServiceCaseStatus(req.params.id, serviceStatus, {
          comment: req.body?.comment || null,
          actorLabel: req.adminUser?.fullName || req.adminUser?.email || req.adminUser?.id || 'admin',
          changedByUserId: req.adminUser?.id || null,
          invoiceNumber: req.body?.invoiceNumber || undefined,
          invoiceStatus: req.body?.invoiceStatus || undefined,
        });
        if (!item) return res.status(404).json({ error: 'not_found' });
        return res.json({ item });
      } catch (error) {
        if (error?.message === 'invalid_transition') return res.status(409).json({ error: 'invalid_transition' });
        throw error;
      }
    },

    async directorProcess(req, res) {
      if (!can(req.adminUser, PERMISSIONS.directorProcess)) return res.status(403).json({ error: 'forbidden' });
      const serviceStatus = String(req.body?.serviceStatus || '').trim();
      if (!serviceStatus) return res.status(400).json({ error: 'service_status_required' });

      const existing = await serviceOpsRepository.getServiceCaseById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'not_found' });

      const decision = evaluateServiceStatusChange(req.adminUser, existing.serviceStatus, serviceStatus);
      if (!decision.allowed) {
        if (decision.reason === 'invalid_transition') return res.status(409).json({ error: 'invalid_transition' });
        return res.status(403).json({ error: decision.reason || 'forbidden_transition' });
      }

      const invoiceIssued = req.body?.invoiceIssued === true;
      try {
        const item = await serviceOpsRepository.updateServiceCaseStatus(req.params.id, serviceStatus, {
          comment: req.body?.comment || null,
          actorLabel: req.adminUser?.fullName || req.adminUser?.email || req.adminUser?.id || 'director',
          changedByUserId: req.adminUser?.id || null,
          invoiceNumber: req.body?.invoiceNumber || undefined,
          invoiceStatus: req.body?.invoiceStatus || (invoiceIssued ? 'issued' : undefined),
        });
        if (!item) return res.status(404).json({ error: 'not_found' });
        return res.json({
          item: {
            ...item,
            invoiceIssued: ['issued', 'paid'].includes(String(item.invoiceStatus || '').toLowerCase()),
          },
        });
      } catch (error) {
        if (error?.message === 'invalid_transition') return res.status(409).json({ error: 'invalid_transition' });
        throw error;
      }
    },

    async directorQueue(req, res) {
      if (!can(req.adminUser, PERMISSIONS.directorProcess)) return res.status(403).json({ error: 'forbidden' });
      const serviceCases = await serviceOpsRepository.listServiceCases({
        ...(req.query || {}),
        serviceStatus: req.query?.serviceStatus || 'ready',
      });
      const equipment = await serviceOpsRepository.listEquipment({
        ...(req.query || {}),
      });
      const commercialQueue = equipment.filter((item) => ['ready_for_issue', 'ready_for_rent', 'ready_for_sale'].includes(item.commercialStatus));

      const withActions = serviceCases.map((item) => {
        const serviceActions = Object.keys(getAllowedServiceTransitions(item.serviceStatus || ''))
          .filter((toStatus) => canChangeServiceStatus(req.adminUser, item.serviceStatus, toStatus));
        const commercialActions = Object.keys(getAllowedCommercialTransitions(item.equipment?.commercialStatus || 'none'))
          .filter((toStatus) => evaluateCommercialStatusChange(req.adminUser, item.serviceStatus, item.equipment?.commercialStatus || 'none', toStatus).allowed);
        const nextActions = buildNextActions({
          serviceStatus: item.serviceStatus,
          commercialStatus: item.equipment?.commercialStatus || 'none',
          serviceActions,
          commercialActions,
        });
        return { ...item, availableActions: nextActions.all, nextActions };
      });
      return res.json({ serviceCases: withActions, commercialQueue });
    },

    async addNote(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceCaseAddNote)) return res.status(403).json({ error: 'forbidden' });
      const body = String(req.body?.body || '').trim();
      if (!body) return res.status(400).json({ error: 'note_required' });
      const serviceCase = await serviceOpsRepository.getServiceCaseById(req.params.id);
      if (!serviceCase) return res.status(404).json({ error: 'not_found' });
      const note = await serviceOpsRepository.addServiceCaseNote(req.params.id, {
        authorUserId: req.adminUser?.id || null,
        body,
        isInternal: req.body?.isInternal !== false,
      });
      return res.status(201).json({ note });
    },

    async addMedia(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceCaseUploadMedia)) return res.status(403).json({ error: 'forbidden' });
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

    async addEquipmentMedia(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceCaseUploadMedia)) return res.status(403).json({ error: 'forbidden' });
      const equipment = await serviceOpsRepository.getEquipmentById(req.params.id);
      if (!equipment) return res.status(404).json({ error: 'not_found' });
      if (!req.files?.length) return res.status(400).json({ error: 'file_required' });

      const serviceCaseId = String(req.body?.serviceCaseId || '').trim() || null;
      if (serviceCaseId) {
        const serviceCase = await serviceOpsRepository.getServiceCaseById(serviceCaseId);
        if (!serviceCase || serviceCase.equipmentId !== req.params.id) return res.status(409).json({ error: 'invalid_service_case' });
      }

      const saved = [];
      for (const file of req.files) {
        const meta = await storeServiceMediaFile({ uploadsRoot, file, prefix: 'equipment' });
        const row = await serviceOpsRepository.createMedia(serviceCaseId, {
          equipmentId: req.params.id,
          ...meta,
          uploadedByUserId: req.adminUser?.id || null,
          caption: String(req.body?.caption || '').trim() || null,
        });
        saved.push(row);
      }
      return res.status(201).json({ media: saved, placement: serviceCaseId ? 'service_case' : 'equipment' });
    },

    async deleteMedia(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceCaseUploadMedia)) return res.status(403).json({ error: 'forbidden' });
      const removed = await serviceOpsRepository.deleteMediaById(req.params.mediaId);
      if (!removed) return res.status(404).json({ error: 'not_found' });
      return res.json({ removed });
    },

    async history(req, res) {
      if (!can(req.adminUser, PERMISSIONS.serviceCaseRead)) return res.status(403).json({ error: 'forbidden' });
      const serviceCase = await serviceOpsRepository.getServiceCaseById(req.params.id);
      if (!serviceCase) return res.status(404).json({ error: 'not_found' });
      const history = await serviceOpsRepository.listServiceCaseHistory(req.params.id);
      return res.json({ history });
    },

    async equipmentDashboard(req, res) {
      if (!can(req.adminUser, PERMISSIONS.equipmentRead)) return res.status(403).json({ error: 'forbidden' });
      const dashboard = await serviceOpsRepository.equipmentDashboard(req.query || {});
      return res.json(dashboard || { kpi: {}, alerts: [] });
    },

    async listEquipment(req, res) {
      if (!can(req.adminUser, PERMISSIONS.equipmentRead)) return res.status(403).json({ error: 'forbidden' });
      const items = await serviceOpsRepository.listEquipment(req.query || {});
      return res.json({ items });
    },

    async equipmentById(req, res) {
      if (!can(req.adminUser, PERMISSIONS.equipmentRead)) return res.status(403).json({ error: 'forbidden' });
      const item = await serviceOpsRepository.getEquipmentById(req.params.id);
      if (!item) return res.status(404).json({ error: 'not_found' });
      const availableCommercialActions = Object.keys(getAllowedCommercialTransitions(item.commercialStatus || 'none'))
        .filter((toStatus) => evaluateCommercialStatusChange(req.adminUser, item.serviceStatus, item.commercialStatus || 'none', toStatus).allowed);
      const nextActions = buildNextActions({
        serviceStatus: item.serviceStatus,
        commercialStatus: item.commercialStatus || 'none',
        commercialActions: availableCommercialActions,
      });
      return res.json({
        item: {
          ...item,
          availableCommercialActions,
          availableActions: nextActions.all,
          nextActions,
        },
      });
    },

    async updateEquipment(req, res) {
      if (!can(req.adminUser, PERMISSIONS.equipmentUpdateCommercial)) return res.status(403).json({ error: 'forbidden' });
      const existing = await serviceOpsRepository.getEquipmentById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'not_found' });
      const item = await serviceOpsRepository.updateEquipmentById(req.params.id, req.body || {});
      return res.json({ item });
    },

    async createEquipment(req, res) {
      if (!can(req.adminUser, PERMISSIONS.equipmentUpdateCommercial)) return res.status(403).json({ error: 'forbidden' });
      const created = await serviceOpsRepository.createEquipmentCard({
        ...req.body,
      });
      return res.status(201).json({ item: { equipment: created, serviceCase: null } });
    },

    async equipmentDetail(req, res) {
      if (!can(req.adminUser, PERMISSIONS.equipmentRead)) return res.status(403).json({ error: 'forbidden' });
      const payload = await serviceOpsRepository.getEquipmentDetail(req.params.id);
      if (!payload) return res.status(404).json({ error: 'not_found' });

      const activeCase = (payload.serviceCases || []).find((item) => item.isActive)
        || (payload.serviceCases || [])[0]
        || null;
      const serviceStatus = activeCase?.serviceStatus || payload.equipment?.serviceStatus || '';
      const commercialStatus = payload.equipment?.commercialStatus || 'none';
      const serviceActions = activeCase
        ? Object.keys(getAllowedServiceTransitions(serviceStatus))
          .filter((toStatus) => canChangeServiceStatus(req.adminUser, serviceStatus, toStatus))
        : [];
      const commercialActions = Object.keys(getAllowedCommercialTransitions(commercialStatus))
        .filter((toStatus) => evaluateCommercialStatusChange(req.adminUser, serviceStatus, commercialStatus, toStatus).allowed);
      const currentActions = buildNextActions({
        serviceStatus,
        commercialStatus,
        serviceActions,
        commercialActions,
      });
      const normalizedMedia = normalizeEquipmentMedia(req, payload.media || []);
      const timeline = buildEquipmentTimeline({ ...payload, media: normalizedMedia });

      return res.json({
        item: {
          ...payload,
          media: normalizedMedia,
          timeline,
          currentActions,
        },
      });
    },

    async addEquipmentComment(req, res) {
      if (!can(req.adminUser, PERMISSIONS.equipmentRead)) return res.status(403).json({ error: 'forbidden' });
      const body = String(req.body?.body || '').trim();
      if (!body) return res.status(400).json({ error: 'comment_required' });
      const equipment = await serviceOpsRepository.getEquipmentById(req.params.id);
      if (!equipment) return res.status(404).json({ error: 'not_found' });
      const item = await serviceOpsRepository.addEquipmentComment(req.params.id, {
        body,
        authorUserId: req.adminUser?.id || null,
      });
      return res.status(201).json({ item });
    },

    async addEquipmentNote(req, res) {
      if (!can(req.adminUser, PERMISSIONS.equipmentRead)) return res.status(403).json({ error: 'forbidden' });
      const body = String(req.body?.body || '').trim();
      if (!body) return res.status(400).json({ error: 'note_required' });
      const equipment = await serviceOpsRepository.getEquipmentById(req.params.id);
      if (!equipment) return res.status(404).json({ error: 'not_found' });
      const item = await serviceOpsRepository.addEquipmentNote(req.params.id, {
        body,
        authorUserId: req.adminUser?.id || null,
      });
      return res.status(201).json({ item });
    },

    async createServiceTask(req, res) {
      if (!can(req.adminUser, PERMISSIONS.equipmentRead)) return res.status(403).json({ error: 'forbidden' });
      const title = String(req.body?.title || '').trim();
      if (!title) return res.status(400).json({ error: 'title_required' });
      const item = await serviceOpsRepository.createServiceTask({
        serviceCaseId: req.body?.serviceCaseId || null,
        equipmentId: req.body?.equipmentId || req.params.id || null,
        title,
        description: String(req.body?.description || '').trim() || null,
        status: String(req.body?.status || 'todo'),
        assignedToUserId: req.body?.assignedToUserId || null,
        createdByUserId: req.adminUser?.id || null,
        dueAt: req.body?.dueAt || null,
      });
      return res.status(201).json({ item });
    },

    async listServiceTasks(req, res) {
      if (!can(req.adminUser, PERMISSIONS.equipmentRead)) return res.status(403).json({ error: 'forbidden' });
      const items = await serviceOpsRepository.listServiceTasks({
        equipmentId: req.query?.equipmentId || req.params.id || undefined,
        serviceCaseId: req.query?.serviceCaseId || undefined,
      });
      return res.json({ items });
    },

    async updateServiceTaskStatus(req, res) {
      if (!can(req.adminUser, PERMISSIONS.equipmentRead)) return res.status(403).json({ error: 'forbidden' });
      const status = String(req.body?.status || '').trim();
      if (!status) return res.status(400).json({ error: 'status_required' });
      const item = await serviceOpsRepository.updateServiceTaskStatus(req.params.taskId, status);
      if (!item) return res.status(404).json({ error: 'not_found' });
      return res.json({ item });
    },

    async intakeCreate(req, res) {
      if (!can(req.adminUser, PERMISSIONS.equipmentUpdateCommercial)) return res.status(403).json({ error: 'forbidden' });
      const created = await serviceOpsRepository.createEquipmentWithIntake({
        ...req.body,
        changedByUserId: req.adminUser?.id || null,
        actorLabel: req.adminUser?.fullName || req.adminUser?.id || 'admin',
        intakeType: req.body?.intakeType || 'manual_intake',
        serviceStatus: req.body?.serviceStatus || 'accepted',
      });
      return res.status(201).json({ item: created });
    },

    async updateCommercialStatus(req, res) {
      if (!can(req.adminUser, PERMISSIONS.equipmentUpdateCommercial)) return res.status(403).json({ error: 'forbidden' });
      const commercialStatus = String(req.body?.commercialStatus || '').trim();
      if (!commercialStatus) return res.status(400).json({ error: 'commercial_status_required' });

      const equipment = await serviceOpsRepository.getEquipmentById(req.params.id);
      if (!equipment) return res.status(404).json({ error: 'not_found' });

      const lastServiceCase = req.body?.serviceCaseId
        ? await serviceOpsRepository.getServiceCaseById(req.body.serviceCaseId)
        : null;
      const effectiveServiceStatus = lastServiceCase?.serviceStatus || equipment.serviceStatus;

      return applyCommercialStatusChange(req, res, {
        equipmentId: req.params.id,
        serviceStatus: effectiveServiceStatus,
        fromCommercialStatus: equipment.commercialStatus || 'none',
        toCommercialStatus: commercialStatus,
        serviceCaseId: req.body?.serviceCaseId || null,
        actorFallback: 'admin',
      });
    },

    async directorCommercialRoute(req, res) {
      if (!can(req.adminUser, PERMISSIONS.directorProcess)) return res.status(403).json({ error: 'forbidden' });
      const serviceCaseId = String(req.body?.serviceCaseId || req.params.id || '').trim();
      const commercialStatus = String(req.body?.commercialStatus || '').trim();
      if (!serviceCaseId) return res.status(400).json({ error: 'service_case_required' });
      if (!commercialStatus) return res.status(400).json({ error: 'commercial_status_required' });

      const serviceCase = await serviceOpsRepository.getServiceCaseById(serviceCaseId);
      if (!serviceCase) return res.status(404).json({ error: 'not_found' });
      if (!serviceCase.equipmentId) return res.status(409).json({ error: 'equipment_required' });

      const equipment = await serviceOpsRepository.getEquipmentById(serviceCase.equipmentId);
      if (!equipment) return res.status(404).json({ error: 'equipment_not_found' });

      return applyCommercialStatusChange(req, res, {
        equipmentId: serviceCase.equipmentId,
        serviceStatus: serviceCase.serviceStatus,
        fromCommercialStatus: equipment.commercialStatus || 'none',
        toCommercialStatus: commercialStatus,
        serviceCaseId,
        actorFallback: 'director',
      });
    },

    async listSalesEquipment(req, res) {
      if (!can(req.adminUser, PERMISSIONS.salesOperate)) return res.status(403).json({ error: 'forbidden' });
      const items = await serviceOpsRepository.listEquipment({
        ...(req.query || {}),
      });
      const allowedStatuses = new Set([
        'ready_for_rent',
        'reserved_for_rent',
        'out_on_rent',
        'out_on_replacement',
        'ready_for_sale',
        'reserved_for_sale',
        'sold',
      ]);
      const filtered = items.filter((item) => allowedStatuses.has(String(item.commercialStatus || 'none')));
      const withActions = filtered.map((item) => {
        const commercialActions = Object.keys(getAllowedCommercialTransitions(item.commercialStatus || 'none'))
          .filter((toStatus) => evaluateCommercialStatusChange(req.adminUser, item.serviceStatus, item.commercialStatus || 'none', toStatus).allowed);
        const nextActions = buildNextActions({
          serviceStatus: item.serviceStatus,
          commercialStatus: item.commercialStatus || 'none',
          commercialActions,
        });
        return { ...item, availableActions: nextActions.all, nextActions };
      });
      return res.json({ items: withActions });
    },

    async reserveForRent(req, res) {
      if (!can(req.adminUser, PERMISSIONS.salesOperate)) return res.status(403).json({ error: 'forbidden' });
      const equipment = await serviceOpsRepository.getEquipmentById(req.params.id);
      if (!equipment) return res.status(404).json({ error: 'not_found' });

      return applyCommercialStatusChange(req, res, {
        equipmentId: req.params.id,
        serviceStatus: equipment.serviceStatus,
        fromCommercialStatus: equipment.commercialStatus || 'none',
        toCommercialStatus: 'reserved_for_rent',
        serviceCaseId: req.body?.serviceCaseId || null,
        actorFallback: 'sales',
      });
    },

    async reserveForSale(req, res) {
      if (!can(req.adminUser, PERMISSIONS.salesOperate)) return res.status(403).json({ error: 'forbidden' });
      const equipment = await serviceOpsRepository.getEquipmentById(req.params.id);
      if (!equipment) return res.status(404).json({ error: 'not_found' });

      return applyCommercialStatusChange(req, res, {
        equipmentId: req.params.id,
        serviceStatus: equipment.serviceStatus,
        fromCommercialStatus: equipment.commercialStatus || 'none',
        toCommercialStatus: 'reserved_for_sale',
        serviceCaseId: req.body?.serviceCaseId || null,
        actorFallback: 'sales',
      });
    },

    async equipmentServiceCases(req, res) {
      if (!can(req.adminUser, PERMISSIONS.equipmentRead)) return res.status(403).json({ error: 'forbidden' });
      const equipment = await serviceOpsRepository.getEquipmentById(req.params.id);
      if (!equipment) return res.status(404).json({ error: 'not_found' });
      const items = await serviceOpsRepository.listEquipmentServiceCases(req.params.id);
      return res.json({ items });
    },
  };
}
