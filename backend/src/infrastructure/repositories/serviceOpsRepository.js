import fs from 'fs/promises';
import path from 'path';
import { canTransitionServiceStatus } from '../../domain/transitions.js';
import { buildServiceStatusSideEffects } from '../../domain/serviceWorkflow.js';
import { evaluateAlerts } from '../../domain/alertsEngine.js';

function nowIso() { return new Date().toISOString(); }

function diffMinutes(from, to) {
  if (!from || !to) return null;
  const fromTs = new Date(from).getTime();
  const toTs = new Date(to).getTime();
  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs < fromTs) return null;
  return Math.round((toTs - fromTs) / 60000);
}

function avg(values) {
  const valid = (values || []).filter((item) => Number.isFinite(item));
  if (!valid.length) return null;
  return Math.round(valid.reduce((sum, item) => sum + item, 0) / valid.length);
}

function findFirstHistoryRow(rows, predicate) {
  return (rows || []).find(predicate) || null;
}

function buildAuditTrail(row) {
  const history = (row?.history || []).slice().sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
  const inProgressRow = findFirstHistoryRow(history, (item) => item.toServiceStatus === 'in_progress');
  const testingRow = findFirstHistoryRow(history, (item) => item.toServiceStatus === 'testing');
  const readyRow = findFirstHistoryRow(history, (item) => item.toServiceStatus === 'ready');
  const processedRow = findFirstHistoryRow(history, (item) => item.toServiceStatus === 'processed');
  const commercialRows = history
    .filter((item) => !item.toServiceStatus && item.toStatusRaw)
    .map((item) => ({
      id: item.id,
      fromStatus: item.fromStatusRaw || null,
      toStatus: item.toStatusRaw || null,
      changedAt: item.changedAt?.toISOString?.() || item.changedAt || null,
      actorLabel: item.changedByUser?.fullName || item.actorLabel || 'system',
      changedByUser: item.changedByUser ? { id: item.changedByUser.id, fullName: item.changedByUser.fullName, role: item.changedByUser.role } : null,
      comment: item.comment || null,
    }));

  return {
    assigned: {
      at: row?.assignedAt?.toISOString?.() || row?.assignedAt || null,
      actorLabel: row?.assignedByUser?.fullName || null,
      user: row?.assignedByUser ? { id: row.assignedByUser.id, fullName: row.assignedByUser.fullName, role: row.assignedByUser.role } : null,
    },
    takenInWork: {
      at: inProgressRow?.changedAt?.toISOString?.() || inProgressRow?.changedAt || null,
      actorLabel: inProgressRow?.changedByUser?.fullName || inProgressRow?.actorLabel || null,
      user: inProgressRow?.changedByUser ? { id: inProgressRow.changedByUser.id, fullName: inProgressRow.changedByUser.fullName, role: inProgressRow.changedByUser.role } : null,
    },
    movedToTesting: {
      at: testingRow?.changedAt?.toISOString?.() || testingRow?.changedAt || null,
      actorLabel: testingRow?.changedByUser?.fullName || testingRow?.actorLabel || null,
      user: testingRow?.changedByUser ? { id: testingRow.changedByUser.id, fullName: testingRow.changedByUser.fullName, role: testingRow.changedByUser.role } : null,
    },
    movedToReady: {
      at: readyRow?.changedAt?.toISOString?.() || readyRow?.changedAt || null,
      actorLabel: readyRow?.changedByUser?.fullName || readyRow?.actorLabel || null,
      user: readyRow?.changedByUser ? { id: readyRow.changedByUser.id, fullName: readyRow.changedByUser.fullName, role: readyRow.changedByUser.role } : null,
    },
    processed: {
      at: row?.processedAt?.toISOString?.() || row?.processedAt || processedRow?.changedAt?.toISOString?.() || processedRow?.changedAt || null,
      actorLabel: row?.processedByUser?.fullName || processedRow?.changedByUser?.fullName || processedRow?.actorLabel || null,
      user: row?.processedByUser
        ? { id: row.processedByUser.id, fullName: row.processedByUser.fullName, role: row.processedByUser.role }
        : (processedRow?.changedByUser ? { id: processedRow.changedByUser.id, fullName: processedRow.changedByUser.fullName, role: processedRow.changedByUser.role } : null),
    },
    commercialChanges: commercialRows,
  };
}

function mapEquipment(item) {
  if (!item) return null;
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() || item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() || item.updatedAt,
  };
}

function mapCase(item) {
  if (!item) return null;
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() || item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() || item.updatedAt,
    acceptedAt: item.acceptedAt?.toISOString?.() || item.acceptedAt || null,
    assignedAt: item.assignedAt?.toISOString?.() || item.assignedAt || null,
    testingAt: item.testingAt?.toISOString?.() || item.testingAt || null,
    readyAt: item.readyAt?.toISOString?.() || item.readyAt || null,
    processedAt: item.processedAt?.toISOString?.() || item.processedAt || null,
    closedAt: item.closedAt?.toISOString?.() || item.closedAt || null,
    equipment: mapEquipment(item.equipment),
    assignedToUser: item.assignedToUser ? { id: item.assignedToUser.id, fullName: item.assignedToUser.fullName, role: item.assignedToUser.role } : null,
    assignedByUser: item.assignedByUser ? { id: item.assignedByUser.id, fullName: item.assignedByUser.fullName, role: item.assignedByUser.role } : null,
    processedByUser: item.processedByUser ? { id: item.processedByUser.id, fullName: item.processedByUser.fullName, role: item.processedByUser.role } : null,
  };
}

function mapHistoryRow(item) {
  if (!item) return null;
  return {
    ...item,
    changedAt: item.changedAt?.toISOString?.() || item.changedAt,
    changedByUser: item.changedByUser ? { id: item.changedByUser.id, fullName: item.changedByUser.fullName, role: item.changedByUser.role } : null,
  };
}

function mapNote(item) {
  if (!item) return null;
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() || item.createdAt,
    authorUser: item.authorUser ? { id: item.authorUser.id, fullName: item.authorUser.fullName, role: item.authorUser.role } : null,
  };
}

function mapMedia(item) {
  if (!item) return null;
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() || item.createdAt,
    uploadedByUser: item.uploadedByUser ? { id: item.uploadedByUser.id, fullName: item.uploadedByUser.fullName, role: item.uploadedByUser.role } : null,
  };
}

export class NeonServiceOpsRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async dashboard(filters = {}) {
    const where = this.buildWhere(filters);
    const cases = await this.prisma.serviceCase.findMany({
      where,
      include: {
        equipment: true,
        assignedToUser: true,
      },
    });
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayEnd = dayStart + 24 * 3600000;
    const nowTs = Date.now();
    const serviceCaseIds = cases.map((item) => item.id);
    const historyRows = serviceCaseIds.length
      ? await this.prisma.serviceStatusHistory.findMany({
          where: { serviceCaseId: { in: serviceCaseIds } },
          include: { changedByUser: true },
          orderBy: { changedAt: 'asc' },
        })
      : [];
    const historyByCaseId = historyRows.reduce((acc, row) => {
      if (!row.serviceCaseId) return acc;
      if (!acc[row.serviceCaseId]) acc[row.serviceCaseId] = [];
      acc[row.serviceCaseId].push(row);
      return acc;
    }, {});

    const overdueByStage = {
      accepted: 0,
      in_progress: 0,
      testing: 0,
      ready: 0,
    };
    for (const item of cases) {
      const ageHours = (nowTs - new Date(item.updatedAt).getTime()) / 3600000;
      if (item.serviceStatus === 'accepted' && ageHours > 12) overdueByStage.accepted += 1;
      if (item.serviceStatus === 'in_progress' && ageHours > 48) overdueByStage.in_progress += 1;
      if (item.serviceStatus === 'testing' && ageHours > 24) overdueByStage.testing += 1;
      if (item.serviceStatus === 'ready' && ageHours > 24) overdueByStage.ready += 1;
    }

    const assignTimes = cases.map((item) => diffMinutes(item.acceptedAt || item.createdAt, item.assignedAt));
    const readyTimes = cases.map((item) => diffMinutes(item.acceptedAt || item.createdAt, item.readyAt));
    const processedTimes = cases.map((item) => diffMinutes(item.acceptedAt || item.createdAt, item.processedAt));
    const inProgressTimes = cases.map((item) => {
      const rows = historyByCaseId[item.id] || [];
      const entered = findFirstHistoryRow(rows, (row) => row.toServiceStatus === 'in_progress');
      const finished = findFirstHistoryRow(rows, (row) => ['testing', 'ready', 'processed', 'closed'].includes(String(row.toServiceStatus || '')));
      return diffMinutes(entered?.changedAt || item.assignedAt || item.updatedAt, finished?.changedAt || item.testingAt || item.readyAt || item.processedAt);
    });

    const engineerWorkloadMap = {};
    for (const item of cases) {
      if (!item.assignedToUserId) continue;
      if (!engineerWorkloadMap[item.assignedToUserId]) {
        engineerWorkloadMap[item.assignedToUserId] = {
          userId: item.assignedToUserId,
          engineerName: item.assignedToUser?.fullName || item.assignedToUserId,
          activeCases: 0,
          readyCases: 0,
          processedCases: 0,
        };
      }
      const bucket = engineerWorkloadMap[item.assignedToUserId];
      if (['accepted', 'in_progress', 'testing', 'ready'].includes(item.serviceStatus)) bucket.activeCases += 1;
      if (item.serviceStatus === 'ready') bucket.readyCases += 1;
      if (item.serviceStatus === 'processed') bucket.processedCases += 1;
    }

    const alertState = evaluateAlerts(cases, { now });

    const [lastSentNotifications, deliveryState, topWorseningBottlenecks] = await Promise.all([
      this.listNotificationLogs({ limit: 12 }),
      this.getNotificationDeliveryState(),
      this.getTopWorseningBottlenecks({ days: 7 }),
    ]);

    const metrics = {
      newCount: cases.filter((c) => c.serviceStatus === 'accepted').length,
      inProgressCount: cases.filter((c) => c.serviceStatus === 'in_progress').length,
      testingCount: cases.filter((c) => c.serviceStatus === 'testing').length,
      readyCount: cases.filter((c) => c.serviceStatus === 'ready').length,
      processedCount: cases.filter((c) => c.serviceStatus === 'processed').length,
      overdueCount: cases.filter((c) => ['accepted', 'in_progress', 'testing'].includes(c.serviceStatus) && (Date.now() - new Date(c.createdAt).getTime()) > 72 * 3600000).length,
      unassignedCount: cases.filter((c) => !c.assignedToUserId).length,
      closedTodayCount: cases.filter((c) => {
        const closedAt = c.closedAt ? new Date(c.closedAt).getTime() : null;
        return closedAt && closedAt >= dayStart && closedAt < dayEnd;
      }).length,
      readyForDirectorCount: cases.filter((c) => c.serviceStatus === 'ready').length,
      readyForRentCount: cases.filter((c) => c.equipment?.commercialStatus === 'ready_for_rent').length,
      readyForSaleCount: cases.filter((c) => c.equipment?.commercialStatus === 'ready_for_sale').length,
      serviceAverages: {
        avgAssignTimeMinutes: avg(assignTimes),
        avgRepairTimeMinutes: avg(inProgressTimes),
      },
      slaAging: {
        timeToAssignMinutes: avg(assignTimes),
        timeInProgressMinutes: avg(inProgressTimes),
        timeToReadyMinutes: avg(readyTimes),
        timeToProcessedMinutes: avg(processedTimes),
        overdueByStage,
        staleReadyCount: cases.filter((item) => item.serviceStatus === 'ready' && (nowTs - new Date(item.updatedAt).getTime()) > 24 * 3600000).length,
        staleRentSaleBacklogCount: cases.filter((item) => ['ready_for_rent', 'ready_for_sale'].includes(item.equipment?.commercialStatus) && (nowTs - new Date(item.updatedAt).getTime()) > 24 * 3600000).length,
      },
      roleAnalytics: {
        service: {
          avgAssignTimeMinutes: avg(assignTimes),
          avgRepairTimeMinutes: avg(inProgressTimes),
          overdueCases: cases.filter((item) => ['accepted', 'in_progress', 'testing'].includes(item.serviceStatus) && (nowTs - new Date(item.updatedAt).getTime()) > 48 * 3600000).length,
          engineerWorkload: Object.values(engineerWorkloadMap),
        },
        director: {
          readyAgingCount: cases.filter((item) => item.serviceStatus === 'ready' && (nowTs - new Date(item.updatedAt).getTime()) > 24 * 3600000).length,
          processedTodayCount: cases.filter((item) => {
            const processedAt = item.processedAt ? new Date(item.processedAt).getTime() : null;
            return processedAt && processedAt >= dayStart && processedAt < dayEnd;
          }).length,
          routeBacklogCount: cases.filter((item) => ['ready_for_issue', 'ready_for_rent', 'ready_for_sale'].includes(item.equipment?.commercialStatus)).length,
        },
        sales: {
          rentBacklogCount: cases.filter((item) => ['ready_for_rent', 'reserved_for_rent'].includes(item.equipment?.commercialStatus)).length,
          saleBacklogCount: cases.filter((item) => ['ready_for_sale', 'reserved_for_sale'].includes(item.equipment?.commercialStatus)).length,
          reservedAgingCount: cases.filter((item) => ['reserved_for_rent', 'reserved_for_sale'].includes(item.equipment?.commercialStatus) && (nowTs - new Date(item.updatedAt).getTime()) > 48 * 3600000).length,
        },
      },
      alerts: alertState,
      notifications: {
        preview: alertState.notificationPreview,
        lastSent: lastSentNotifications,
        deliveryState,
        nextScheduledDigest: this.getNextScheduledDigestPreview(now),
      },
      weeklyExecutiveReport: {
        generatedAt: now.toISOString(),
        serviceTotals: { totalCases: cases.length, unassigned: cases.filter((item) => !item.assignedToUserId).length },
        alertsSummary: alertState.summary,
        roleAnalytics: {
          director: {
            readyAgingCount: cases.filter((item) => item.serviceStatus === 'ready' && (nowTs - new Date(item.updatedAt).getTime()) > 24 * 3600000).length,
            routeBacklogCount: cases.filter((item) => ['ready_for_issue', 'ready_for_rent', 'ready_for_sale'].includes(item.equipment?.commercialStatus)).length,
          },
          sales: {
            rentBacklogCount: cases.filter((item) => ['ready_for_rent', 'reserved_for_rent'].includes(item.equipment?.commercialStatus)).length,
            saleBacklogCount: cases.filter((item) => ['ready_for_sale', 'reserved_for_sale'].includes(item.equipment?.commercialStatus)).length,
            reservedAgingCount: cases.filter((item) => ['reserved_for_rent', 'reserved_for_sale'].includes(item.equipment?.commercialStatus) && (nowTs - new Date(item.updatedAt).getTime()) > 48 * 3600000).length,
          },
        },
      },
      executiveDashboard: {
        lastSentNotifications,
        deliveryState,
        nextScheduledDigest: this.getNextScheduledDigestPreview(now),
        topWorseningBottlenecks,
      },
    };
    return metrics;
  }

  getNextScheduledDigestPreview(now = new Date()) {
    return {
      generatedAt: now.toISOString(),
      daily: new Date(now.getTime() + (24 * 3600000)).toISOString(),
      weekly: new Date(now.getTime() + (7 * 24 * 3600000)).toISOString(),
    };
  }

  async createNotificationLog(payload = {}) {
    return this.prisma.notificationLog.create({
      data: {
        id: payload.id || `nlog-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        channel: payload.channel || 'telegram',
        recipientRole: payload.recipientRole || 'unknown',
        recipientChatId: String(payload.recipientChatId || ''),
        digestType: payload.digestType || 'manual_digest',
        severity: payload.severity || 'info',
        payloadHash: payload.payloadHash || '',
        payloadPreview: payload.payloadPreview || null,
        status: payload.status || 'sent',
        sentAt: payload.sentAt ? new Date(payload.sentAt) : null,
        errorMessage: payload.errorMessage || null,
        retryCount: Number(payload.retryCount || 0),
        triggerType: payload.triggerType || 'manual',
      },
    });
  }

  async updateNotificationLog(id, patch = {}) {
    return this.prisma.notificationLog.update({
      where: { id },
      data: {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.errorMessage !== undefined ? { errorMessage: patch.errorMessage } : {}),
        ...(patch.retryCount !== undefined ? { retryCount: patch.retryCount } : {}),
        ...(patch.sentAt !== undefined ? { sentAt: patch.sentAt ? new Date(patch.sentAt) : null } : {}),
      },
    });
  }

  async findRecentNotificationDuplicate({ channel, recipientRole, recipientChatId, digestType, payloadHash, windowMinutes = 90 } = {}) {
    const since = new Date(Date.now() - (Math.max(1, Number(windowMinutes || 90)) * 60000));
    return this.prisma.notificationLog.findFirst({
      where: {
        channel,
        recipientRole,
        recipientChatId: String(recipientChatId || ''),
        digestType,
        payloadHash,
        status: { in: ['sent', 'retry_pending', 'skipped_duplicate'] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listNotificationLogs({ limit = 20 } = {}) {
    const rows = await this.prisma.notificationLog.findMany({
      take: Math.max(1, Math.min(100, Number(limit || 20))),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((item) => ({
      ...item,
      createdAt: item.createdAt?.toISOString?.() || item.createdAt,
      updatedAt: item.updatedAt?.toISOString?.() || item.updatedAt,
      sentAt: item.sentAt?.toISOString?.() || item.sentAt || null,
    }));
  }

  async listPendingNotificationRetries({ limit = 20 } = {}) {
    return this.prisma.notificationLog.findMany({
      where: { status: 'retry_pending' },
      take: Math.max(1, Math.min(100, Number(limit || 20))),
      orderBy: { createdAt: 'asc' },
    });
  }

  async getNotificationDeliveryState() {
    const rows = await this.prisma.notificationLog.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return rows.reduce((acc, row) => ({ ...acc, [row.status]: row._count._all }), {});
  }

  async getTopWorseningBottlenecks({ days = 7 } = {}) {
    const d = Math.max(2, Number(days || 7));
    const now = Date.now();
    const split = new Date(now - Math.floor(d / 2) * 24 * 3600000);
    const from = new Date(now - d * 24 * 3600000);
    const [recent, previous] = await Promise.all([
      this.prisma.serviceCase.count({ where: { updatedAt: { gte: split }, serviceStatus: { in: ['accepted', 'in_progress', 'testing', 'ready'] } } }),
      this.prisma.serviceCase.count({ where: { updatedAt: { gte: from, lt: split }, serviceStatus: { in: ['accepted', 'in_progress', 'testing', 'ready'] } } }),
    ]);
    return [
      { metric: 'active_backlog', current: recent, previous, delta: recent - previous },
    ].sort((a, b) => b.delta - a.delta);
  }

  async createReportExportHistory(payload = {}) {
    return this.prisma.reportExportHistory.create({
      data: {
        id: payload.id || `rexp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        reportType: payload.reportType || 'unknown',
        format: payload.format || 'csv',
        triggerType: payload.triggerType || 'manual',
        requestedByRole: payload.requestedByRole || null,
        requestedByUserId: payload.requestedByUserId || null,
        filtersJson: payload.filtersJson || null,
        status: payload.status || 'success',
      },
    });
  }

  async listReportExportHistory({ limit = 25 } = {}) {
    const rows = await this.prisma.reportExportHistory.findMany({
      take: Math.max(1, Math.min(200, Number(limit || 25))),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((item) => ({ ...item, createdAt: item.createdAt?.toISOString?.() || item.createdAt }));
  }

  async saveReportPreset(payload = {}) {
    const id = payload.id || `rpre-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const key = payload.key || `${payload.reportType || 'report'}-${payload.ownerRole || 'global'}`;
    const upserted = await this.prisma.reportPreset.upsert({
      where: { key },
      update: {
        title: payload.title || key,
        reportType: payload.reportType || 'service_cases',
        filtersJson: payload.filtersJson || '{}',
        isSystem: payload.isSystem ?? false,
        ownerRole: payload.ownerRole || null,
        ownerUserId: payload.ownerUserId || null,
        createdByUserId: payload.createdByUserId || null,
      },
      create: {
        id,
        key,
        title: payload.title || key,
        reportType: payload.reportType || 'service_cases',
        filtersJson: payload.filtersJson || '{}',
        isSystem: payload.isSystem ?? false,
        ownerRole: payload.ownerRole || null,
        ownerUserId: payload.ownerUserId || null,
        createdByUserId: payload.createdByUserId || null,
      },
    });
    return {
      ...upserted,
      createdAt: upserted.createdAt?.toISOString?.() || upserted.createdAt,
      updatedAt: upserted.updatedAt?.toISOString?.() || upserted.updatedAt,
    };
  }

  async listReportPresets({ reportType, ownerRole } = {}) {
    const rows = await this.prisma.reportPreset.findMany({
      where: {
        ...(reportType ? { reportType } : {}),
        ...(ownerRole ? { OR: [{ ownerRole }, { ownerRole: null }] } : {}),
      },
      orderBy: [{ isSystem: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map((item) => ({
      ...item,
      createdAt: item.createdAt?.toISOString?.() || item.createdAt,
      updatedAt: item.updatedAt?.toISOString?.() || item.updatedAt,
    }));
  }

  buildWhere(filters = {}) {
    const { serviceStatus, commercialStatus, ownerType, clientServiceType, equipmentType, assignedToUserId, intakeType, search } = filters;
    return {
      ...(serviceStatus ? { serviceStatus } : {}),
      ...(assignedToUserId ? { assignedToUserId } : {}),
      ...(intakeType ? { intakeType } : {}),
      equipment: {
        ...(commercialStatus ? { commercialStatus } : {}),
        ...(ownerType ? { ownerType } : {}),
        ...(clientServiceType ? { clientServiceType } : {}),
        ...(equipmentType ? { equipmentType } : {}),
        ...(search
          ? {
              OR: [
                { id: { contains: search, mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
                { brand: { contains: search, mode: 'insensitive' } },
                { model: { contains: search, mode: 'insensitive' } },
                { serial: { contains: search, mode: 'insensitive' } },
                { internalNumber: { contains: search, mode: 'insensitive' } },
                { clientName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    };
  }

  async listServiceCases(filters = {}) {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.serviceCase.findMany({
      where,
      include: { equipment: true, assignedToUser: true, assignedByUser: true, processedByUser: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapCase);
  }

  async getServiceCaseById(id) {
    const row = await this.prisma.serviceCase.findUnique({
      where: { id },
      include: {
        equipment: true,
        assignedToUser: true,
        assignedByUser: true,
        processedByUser: true,
        notes: { include: { authorUser: true }, orderBy: { createdAt: 'desc' } },
        media: { include: { uploadedByUser: true }, orderBy: { createdAt: 'desc' } },
        history: { include: { changedByUser: true }, orderBy: { changedAt: 'asc' } },
      },
    });
    const mapped = mapCase(row);
    if (!mapped) return null;
    const auditTrail = buildAuditTrail(row);
    return {
      ...mapped,
      notes: (row?.notes || []).map(mapNote),
      media: (row?.media || []).map(mapMedia),
      auditTrail,
    };
  }

  async assignServiceCase(id, assignedToUserId, assignedByUserId) {
    const updated = await this.prisma.serviceCase.update({
      where: { id },
      data: { assignedToUserId, assignedByUserId: assignedByUserId || null, assignedAt: new Date() },
      include: { equipment: true, assignedToUser: true, assignedByUser: true, processedByUser: true },
    });
    return mapCase(updated);
  }

  async updateServiceCaseStatus(id, nextStatus, options = {}) {
    const existing = await this.prisma.serviceCase.findUnique({ where: { id }, include: { equipment: true } });
    if (!existing) return null;
    if (!canTransitionServiceStatus(existing.serviceStatus, nextStatus)) throw new Error('invalid_transition');

    const sideEffectsPatch = buildServiceStatusSideEffects({
      fromStatus: existing.serviceStatus,
      toStatus: nextStatus,
      actorUserId: options.changedByUserId || null,
    });

    const updated = await this.prisma.serviceCase.update({
      where: { id },
      data: {
        serviceStatus: nextStatus,
        ...sideEffectsPatch,
        ...(options.closingComment !== undefined ? { closingComment: options.closingComment } : {}),
        ...(options.invoiceNumber !== undefined ? { invoiceNumber: options.invoiceNumber } : {}),
        ...(options.invoiceStatus !== undefined ? { invoiceStatus: options.invoiceStatus } : {}),
      },
      include: { equipment: true, assignedToUser: true, assignedByUser: true, processedByUser: true },
    });

    await this.prisma.serviceStatusHistory.create({
      data: {
        id: `ssh-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        equipmentId: existing.equipmentId,
        serviceCaseId: existing.id,
        fromStatusRaw: existing.equipment?.currentStatusRaw || existing.serviceStatus,
        toStatusRaw: nextStatus,
        fromServiceStatus: existing.serviceStatus,
        toServiceStatus: nextStatus,
        comment: options.comment || null,
        actorLabel: options.actorLabel || null,
        changedByUserId: options.changedByUserId || null,
      },
    });

    await this.prisma.equipment.update({
      where: { id: existing.equipmentId },
      data: {
        serviceStatus: nextStatus,
        currentStatusRaw: nextStatus,
        ...(options.comment ? { lastComment: options.comment } : {}),
      },
    });

    return mapCase(updated);
  }

  async addServiceCaseNote(id, payload) {
    const row = await this.prisma.serviceCaseNote.create({
      data: {
        id: `scn-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        serviceCaseId: id,
        authorUserId: payload.authorUserId || null,
        body: payload.body,
        isInternal: payload.isInternal ?? true,
      },
      include: { authorUser: true },
    });
    return mapNote(row);
  }

  async listServiceCaseHistory(id) {
    const rows = await this.prisma.serviceStatusHistory.findMany({
      where: { serviceCaseId: id },
      orderBy: { changedAt: 'desc' },
      include: { changedByUser: true },
    });
    return rows.map(mapHistoryRow);
  }

  async createMedia(id, payload) {
    const row = await this.prisma.serviceCaseMedia.create({
      data: {
        id: `scm-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        serviceCaseId: id,
        equipmentId: payload.equipmentId,
        kind: payload.kind,
        filePath: payload.filePath,
        fileUrl: payload.fileUrl,
        mimeType: payload.mimeType || null,
        originalName: payload.originalName || null,
        fileSize: payload.fileSize || 0,
        caption: payload.caption || null,
        uploadedByUserId: payload.uploadedByUserId || null,
      },
      include: { uploadedByUser: true },
    });
    return mapMedia(row);
  }

  async equipmentDashboard() {
    const [equipmentRows, activeServiceCases, mediaBuckets] = await Promise.all([
      this.prisma.equipment.findMany({
        select: {
          id: true,
          serviceStatus: true,
          commercialStatus: true,
          serial: true,
          internalNumber: true,
        },
      }),
      this.prisma.serviceCase.findMany({
        where: { serviceStatus: { in: ['accepted', 'in_progress', 'testing', 'ready'] } },
        select: { id: true, equipmentId: true, serviceStatus: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.serviceCaseMedia.groupBy({
        by: ['equipmentId'],
        _count: { _all: true },
      }),
    ]);

    const activeByEquipmentId = new Map();
    for (const row of activeServiceCases) {
      if (!row.equipmentId || activeByEquipmentId.has(row.equipmentId)) continue;
      activeByEquipmentId.set(row.equipmentId, row);
    }

    const mediaCountByEquipmentId = new Map();
    for (const bucket of mediaBuckets) {
      if (!bucket.equipmentId) continue;
      mediaCountByEquipmentId.set(bucket.equipmentId, Number(bucket._count?._all || 0));
    }

    const nowTs = Date.now();
    const alertCounters = {
      missing_serial: 0,
      missing_internal_number: 0,
      missing_photo: 0,
      missing_active_service_case: 0,
      stale_ready: 0,
      inconsistent_status_data: 0,
    };

    for (const equipment of equipmentRows) {
      const activeCase = activeByEquipmentId.get(equipment.id) || null;
      const mediaCount = mediaCountByEquipmentId.get(equipment.id) || 0;

      if (!equipment.serial) alertCounters.missing_serial += 1;
      if (!equipment.internalNumber) alertCounters.missing_internal_number += 1;
      if (mediaCount === 0) alertCounters.missing_photo += 1;
      if (!activeCase) alertCounters.missing_active_service_case += 1;
      if (activeCase?.serviceStatus === 'ready' && (nowTs - new Date(activeCase.updatedAt).getTime()) > 24 * 3600000) alertCounters.stale_ready += 1;

      const serviceStatus = String(equipment.serviceStatus || '').trim();
      const hasLiveServiceStatus = ['accepted', 'in_progress', 'testing', 'ready'].includes(serviceStatus);
      const statusesConflict = (activeCase && serviceStatus && activeCase.serviceStatus !== serviceStatus)
        || (!activeCase && hasLiveServiceStatus)
        || (activeCase && ['processed', 'closed'].includes(serviceStatus));
      if (statusesConflict) alertCounters.inconsistent_status_data += 1;
    }

    const kpi = {
      totalEquipment: equipmentRows.length,
      inService: equipmentRows.filter((item) => ['accepted', 'in_progress', 'testing', 'ready'].includes(String(item.serviceStatus || '').trim())).length,
      readyForRent: equipmentRows.filter((item) => item.commercialStatus === 'ready_for_rent').length,
      readyForSale: equipmentRows.filter((item) => item.commercialStatus === 'ready_for_sale').length,
      issuedToClient: equipmentRows.filter((item) => item.commercialStatus === 'issued_to_client').length,
      onReplacementOrRent: equipmentRows.filter((item) => ['out_on_replacement', 'out_on_rent'].includes(item.commercialStatus)).length,
    };

    return {
      generatedAt: new Date().toISOString(),
      kpi,
      alerts: Object.entries(alertCounters).map(([key, count]) => ({ key, count })),
    };
  }

  async listEquipment(filters = {}) {
    const rows = await this.prisma.equipment.findMany({
      where: {
        ...(filters.ownerType ? { ownerType: filters.ownerType } : {}),
        ...(filters.clientServiceType ? { clientServiceType: filters.clientServiceType } : {}),
        ...(filters.equipmentType ? { equipmentType: filters.equipmentType } : {}),
        ...(filters.serviceStatus ? { serviceStatus: filters.serviceStatus } : {}),
        ...(filters.commercialStatus ? { commercialStatus: filters.commercialStatus } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });

    const ids = rows.map((item) => item.id);
    const [activeCases, mediaBuckets] = ids.length ? await Promise.all([
      this.prisma.serviceCase.findMany({
        where: { equipmentId: { in: ids }, serviceStatus: { in: ['accepted', 'in_progress', 'testing', 'ready'] } },
        select: { id: true, equipmentId: true, serviceStatus: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.serviceCaseMedia.groupBy({
        by: ['equipmentId'],
        where: { equipmentId: { in: ids } },
        _count: { _all: true },
      }),
    ]) : [[], []];

    const activeByEquipmentId = new Map();
    for (const row of activeCases) {
      if (!row.equipmentId || activeByEquipmentId.has(row.equipmentId)) continue;
      activeByEquipmentId.set(row.equipmentId, row);
    }
    const mediaCountByEquipmentId = new Map();
    for (const bucket of mediaBuckets) {
      if (!bucket.equipmentId) continue;
      mediaCountByEquipmentId.set(bucket.equipmentId, Number(bucket._count?._all || 0));
    }

    return rows.map((item) => {
      const mapped = mapEquipment(item);
      const activeCase = activeByEquipmentId.get(item.id) || null;
      const warnings = [];
      if (!item.serial) warnings.push('missing_serial');
      if (!item.internalNumber) warnings.push('missing_internal_number');
      if ((mediaCountByEquipmentId.get(item.id) || 0) === 0) warnings.push('missing_photo');
      if (!activeCase) warnings.push('missing_active_service_case');
      return {
        ...mapped,
        activeServiceCaseId: activeCase?.id || null,
        activeServiceCaseStatus: activeCase?.serviceStatus || null,
        warnings,
      };
    });
  }

  async getEquipmentById(id) {
    const row = await this.prisma.equipment.findUnique({ where: { id } });
    return mapEquipment(row);
  }

  async getEquipmentDetail(id) {
    const equipmentRow = await this.prisma.equipment.findUnique({ where: { id } });
    if (!equipmentRow) return null;

    const [serviceCasesRows, mediaRows, historyRows, notesRows] = await Promise.all([
      this.prisma.serviceCase.findMany({
        where: { equipmentId: id },
        include: { equipment: true, assignedToUser: true, assignedByUser: true, processedByUser: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.serviceCaseMedia.findMany({
        where: {
          OR: [
            { equipmentId: id },
            { serviceCase: { equipmentId: id } },
          ],
        },
        include: { uploadedByUser: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.serviceStatusHistory.findMany({
        where: { equipmentId: id },
        include: { changedByUser: true },
        orderBy: { changedAt: 'asc' },
      }),
      this.prisma.serviceCaseNote.findMany({
        where: { serviceCase: { equipmentId: id } },
        include: { authorUser: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const activeStatuses = new Set(['accepted', 'in_progress', 'testing', 'ready']);
    const serviceCases = serviceCasesRows.map((row) => {
      const mapped = mapCase(row);
      return {
        ...mapped,
        isActive: activeStatuses.has(String(row.serviceStatus || '')),
      };
    });

    const history = historyRows.map((row) => {
      const toServiceStatus = row.toServiceStatus || null;
      const fromServiceStatus = row.fromServiceStatus || null;
      const eventType = toServiceStatus || fromServiceStatus ? 'service' : 'commercial';
      return {
        id: row.id,
        eventType,
        serviceCaseId: row.serviceCaseId || null,
        fromStatus: fromServiceStatus || row.fromStatusRaw || null,
        toStatus: toServiceStatus || row.toStatusRaw || null,
        actorLabel: row.changedByUser?.fullName || row.actorLabel || null,
        actor: row.changedByUser ? { id: row.changedByUser.id, fullName: row.changedByUser.fullName, role: row.changedByUser.role } : null,
        comment: row.comment || null,
        timestamp: row.changedAt?.toISOString?.() || row.changedAt,
        raw: {
          fromStatusRaw: row.fromStatusRaw || null,
          toStatusRaw: row.toStatusRaw || null,
        },
      };
    });

    return {
      equipment: mapEquipment(equipmentRow),
      media: mediaRows.map(mapMedia),
      history,
      serviceCases,
      notes: notesRows.map((row) => ({ ...mapNote(row), serviceCaseId: row.serviceCaseId })),
      activeServiceCaseId: serviceCases.find((row) => row.isActive)?.id || null,
    };
  }

  async updateEquipmentCommercialStatus(id, status, meta = {}) {
    const current = await this.prisma.equipment.findUnique({ where: { id } });
    if (!current) return null;

    const updated = await this.prisma.equipment.update({
      where: { id },
      data: {
        commercialStatus: status,
        currentStatusRaw: status,
        ...(meta.comment ? { lastComment: meta.comment } : {}),
      },
    });

    await this.prisma.serviceStatusHistory.create({
      data: {
        id: `ssh-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        equipmentId: id,
        serviceCaseId: meta.serviceCaseId || null,
        fromStatusRaw: current.currentStatusRaw || current.commercialStatus || null,
        toStatusRaw: status,
        comment: meta.comment || null,
        actorLabel: meta.actorLabel || null,
        changedByUserId: meta.changedByUserId || null,
      },
    });

    return mapEquipment(updated);
  }

  async listEquipmentServiceCases(id) {
    const rows = await this.prisma.serviceCase.findMany({ where: { equipmentId: id }, orderBy: { createdAt: 'desc' } });
    return rows.map(mapCase);
  }
}

export class InMemoryServiceOpsRepository {
  constructor() {
    this.equipment = [];
    this.serviceCases = [];
    this.history = [];
    this.notes = [];
    this.media = [];
    this.notificationLogs = [];
    this.reportExportHistory = [];
    this.reportPresets = [];
  }

  async dashboard() {
    return {
      newCount: 0,
      inProgressCount: 0,
      testingCount: 0,
      readyCount: 0,
      processedCount: 0,
      overdueCount: 0,
      unassignedCount: 0,
      closedTodayCount: 0,
      readyForDirectorCount: 0,
      readyForRentCount: 0,
      readyForSaleCount: 0,
      serviceAverages: { avgAssignTimeMinutes: null, avgRepairTimeMinutes: null },
      slaAging: {
        timeToAssignMinutes: null,
        timeInProgressMinutes: null,
        timeToReadyMinutes: null,
        timeToProcessedMinutes: null,
        overdueByStage: { accepted: 0, in_progress: 0, testing: 0, ready: 0 },
        staleReadyCount: 0,
        staleRentSaleBacklogCount: 0,
      },
      roleAnalytics: {
        service: { avgAssignTimeMinutes: null, avgRepairTimeMinutes: null, overdueCases: 0, engineerWorkload: [] },
        director: { readyAgingCount: 0, processedTodayCount: 0, routeBacklogCount: 0 },
        sales: { rentBacklogCount: 0, saleBacklogCount: 0, reservedAgingCount: 0 },
      },
      alerts: { generatedAt: new Date().toISOString(), alerts: [], summary: { total: 0, critical: 0, warning: 0, info: 0, byType: {}, bySeverity: {} }, escalationBlocks: { serviceHead: [], director: [], salesManager: [], owner: [] }, recentCriticalChanges: [], notificationPreview: { pendingCritical: 0, pendingWarning: 0, digestSize: 0 } },
      notifications: { preview: { pendingCritical: 0, pendingWarning: 0, digestSize: 0 } },
      executiveDashboard: {
        lastSentNotifications: this.notificationLogs.slice(-12).reverse(),
        deliveryState: this.notificationLogs.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {}),
        nextScheduledDigest: { daily: new Date(Date.now() + 24 * 3600000).toISOString(), weekly: new Date(Date.now() + 7 * 24 * 3600000).toISOString() },
        topWorseningBottlenecks: [],
      },
      weeklyExecutiveReport: { generatedAt: new Date().toISOString(), serviceTotals: { totalCases: 0, unassigned: 0 }, alertsSummary: { total: 0, critical: 0, warning: 0, info: 0, byType: {}, bySeverity: {} }, roleAnalytics: { director: { readyAgingCount: 0, routeBacklogCount: 0 }, sales: { rentBacklogCount: 0, saleBacklogCount: 0, reservedAgingCount: 0 } } },
    };
  }
  async listServiceCases() { return []; }
  async getServiceCaseById() { return null; }
  async assignServiceCase() { return null; }
  async updateServiceCaseStatus() { return null; }
  async addServiceCaseNote() { return null; }
  async listServiceCaseHistory() { return []; }
  async createMedia() { return null; }
  async equipmentDashboard() {
    return {
      generatedAt: new Date().toISOString(),
      kpi: {
        totalEquipment: 0,
        inService: 0,
        readyForRent: 0,
        readyForSale: 0,
        issuedToClient: 0,
        onReplacementOrRent: 0,
      },
      alerts: [
        { key: 'missing_serial', count: 0 },
        { key: 'missing_internal_number', count: 0 },
        { key: 'missing_photo', count: 0 },
        { key: 'missing_active_service_case', count: 0 },
        { key: 'stale_ready', count: 0 },
        { key: 'inconsistent_status_data', count: 0 },
      ],
    };
  }
  async listEquipment() { return []; }
  async getEquipmentById() { return null; }
  async getEquipmentDetail() { return null; }
  async updateEquipmentCommercialStatus() { return null; }
  async listEquipmentServiceCases() { return []; }
  async createNotificationLog(payload = {}) {
    const row = {
      id: payload.id || `nlog-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      channel: payload.channel || 'telegram',
      recipientRole: payload.recipientRole || 'unknown',
      recipientChatId: String(payload.recipientChatId || ''),
      digestType: payload.digestType || 'manual_digest',
      severity: payload.severity || 'info',
      payloadHash: payload.payloadHash || '',
      payloadPreview: payload.payloadPreview || null,
      status: payload.status || 'sent',
      sentAt: payload.sentAt || new Date().toISOString(),
      errorMessage: payload.errorMessage || null,
      retryCount: Number(payload.retryCount || 0),
      triggerType: payload.triggerType || 'manual',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.notificationLogs.unshift(row);
    return row;
  }
  async updateNotificationLog(id, patch = {}) {
    const idx = this.notificationLogs.findIndex((item) => item.id === id);
    if (idx < 0) return null;
    this.notificationLogs[idx] = { ...this.notificationLogs[idx], ...patch, updatedAt: new Date().toISOString() };
    return this.notificationLogs[idx];
  }
  async findRecentNotificationDuplicate({ channel, recipientRole, recipientChatId, digestType, payloadHash, windowMinutes = 90 } = {}) {
    const since = Date.now() - (Math.max(1, Number(windowMinutes || 90)) * 60000);
    return this.notificationLogs.find((item) => item.channel === channel
      && item.recipientRole === recipientRole
      && item.recipientChatId === String(recipientChatId || '')
      && item.digestType === digestType
      && item.payloadHash === payloadHash
      && new Date(item.createdAt).getTime() >= since) || null;
  }
  async listNotificationLogs({ limit = 20 } = {}) { return this.notificationLogs.slice(0, limit); }
  async listPendingNotificationRetries({ limit = 20 } = {}) { return this.notificationLogs.filter((item) => item.status === 'retry_pending').slice(0, limit); }
  async getNotificationDeliveryState() {
    return this.notificationLogs.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {});
  }
  async getTopWorseningBottlenecks() { return []; }
  async createReportExportHistory(payload = {}) {
    const row = {
      id: payload.id || `rexp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      reportType: payload.reportType || 'unknown',
      format: payload.format || 'csv',
      triggerType: payload.triggerType || 'manual',
      requestedByRole: payload.requestedByRole || null,
      requestedByUserId: payload.requestedByUserId || null,
      filtersJson: payload.filtersJson || null,
      status: payload.status || 'success',
      createdAt: new Date().toISOString(),
    };
    this.reportExportHistory.unshift(row);
    return row;
  }
  async listReportExportHistory({ limit = 25 } = {}) { return this.reportExportHistory.slice(0, limit); }
  async saveReportPreset(payload = {}) {
    const key = payload.key || `${payload.reportType || 'report'}-${payload.ownerRole || 'global'}`;
    const idx = this.reportPresets.findIndex((item) => item.key === key);
    const row = {
      id: payload.id || this.reportPresets[idx]?.id || `rpre-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      key,
      title: payload.title || key,
      reportType: payload.reportType || 'service_cases',
      filtersJson: payload.filtersJson || '{}',
      isSystem: payload.isSystem ?? false,
      ownerRole: payload.ownerRole || null,
      ownerUserId: payload.ownerUserId || null,
      createdByUserId: payload.createdByUserId || null,
      createdAt: this.reportPresets[idx]?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) this.reportPresets[idx] = row;
    else this.reportPresets.unshift(row);
    return row;
  }
  async listReportPresets({ reportType, ownerRole } = {}) {
    return this.reportPresets.filter((item) => (!reportType || item.reportType === reportType) && (!ownerRole || !item.ownerRole || item.ownerRole === ownerRole));
  }
}

export async function storeServiceMediaFile({ uploadsRoot, file, prefix = 'service-cases' }) {
  await fs.mkdir(path.join(uploadsRoot, prefix), { recursive: true });
  const ext = path.extname(file.originalname || '') || '';
  const fileName = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}${ext}`;
  const relativePath = path.join(prefix, fileName).replaceAll('\\', '/');
  const abs = path.join(uploadsRoot, relativePath);
  await fs.writeFile(abs, file.buffer);
  return {
    filePath: abs,
    fileUrl: `/miniapp-telegram/uploads/${relativePath}`,
    mimeType: file.mimetype,
    originalName: file.originalname,
    fileSize: file.size,
    kind: String(file.mimetype || '').startsWith('video/') ? 'video' : 'photo',
  };
}
