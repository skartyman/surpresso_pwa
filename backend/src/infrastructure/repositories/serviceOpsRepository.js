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
    clientName: item.clientName || item.client?.companyName || null,
    clientPhone: item.clientPhone || item.client?.phone || null,
    locationName: item.location?.name || item.clientLocation || item.companyLocation || null,
    address: item.location?.address || item.clientLocation || item.companyLocation || null,
    networkName: item.network?.name || null,
    createdAt: item.createdAt?.toISOString?.() || item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() || item.updatedAt,
  };
}

function mapPlacementHistory(item) {
  if (!item) return null;
  return {
    ...item,
    startedAt: item.startedAt?.toISOString?.() || item.startedAt,
    endedAt: item.endedAt?.toISOString?.() || item.endedAt || null,
    createdAt: item.createdAt?.toISOString?.() || item.createdAt,
    client: item.client ? {
      id: item.client.id,
      companyName: item.client.companyName,
      contactName: item.client.contactName,
      phone: item.client.phone,
    } : null,
    location: item.location ? {
      id: item.location.id,
      name: item.location.name,
      address: item.location.address,
      city: item.location.city,
    } : null,
    changedByUser: item.changedByUser ? {
      id: item.changedByUser.id,
      fullName: item.changedByUser.fullName,
      role: item.changedByUser.role,
    } : null,
  };
}

function mapClientSummary(item) {
  if (!item) return null;
  const locations = (item.equipment || []).reduce((acc, equipment) => {
    const location = equipment.location;
    const key = location?.id || equipment.locationId || equipment.clientLocation || equipment.companyLocation || 'none';
    if (!acc.has(key)) {
      acc.set(key, {
        id: location?.id || equipment.locationId || null,
        name: location?.name || equipment.clientLocation || equipment.companyLocation || 'Без точки',
        address: location?.address || equipment.clientLocation || equipment.companyLocation || '',
        equipmentCount: 0,
      });
    }
    acc.get(key).equipmentCount += 1;
    return acc;
  }, new Map());
  return {
    id: item.id,
    companyName: item.companyName,
    contactName: item.contactName,
    phone: item.phone,
    isActive: item.isActive,
    createdAt: item.createdAt?.toISOString?.() || item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() || item.updatedAt,
    equipmentCount: item._count?.equipment ?? item.equipment?.length ?? 0,
    requestCount: item._count?.serviceRequests ?? 0,
    locations: Array.from(locations.values()),
  };
}

function getPlacementLabel({ client, location, fallback = 'Surpresso' } = {}) {
  const clientName = client?.companyName || '';
  const locationName = location?.name || '';
  if (clientName && locationName && clientName !== locationName) return `${clientName} · ${locationName}`;
  return clientName || locationName || fallback;
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
    media: Array.isArray(item.media) ? item.media.map(mapMedia) : [],
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

function mapEquipmentComment(item) {
  if (!item) return null;
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() || item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() || item.updatedAt,
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

function mapTask(item) {
  if (!item) return null;
  return {
    ...item,
    dueAt: item.dueAt?.toISOString?.() || item.dueAt || null,
    createdAt: item.createdAt?.toISOString?.() || item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() || item.updatedAt,
    assignedToUser: item.assignedToUser ? { id: item.assignedToUser.id, fullName: item.assignedToUser.fullName, role: item.assignedToUser.role } : null,
    createdByUser: item.createdByUser ? { id: item.createdByUser.id, fullName: item.createdByUser.fullName, role: item.createdByUser.role } : null,
  };
}

function mapTelegramPost(item) {
  if (!item) return null;
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() || item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() || item.updatedAt,
    editedAt: item.editedAt?.toISOString?.() || item.editedAt || null,
    messageType: item.messageType || 'text',
  };
}

function makeTelegramPostId() {
  return `tpost-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function makeTelegramBroadcastKey() {
  return `tbroadcast-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeTelegramKinds(kinds = []) {
  const list = Array.isArray(kinds) ? kinds : [kinds];
  return list.map((item) => String(item || '').trim()).filter(Boolean);
}

function evaluateEquipmentWarnings({ equipment, activeCase, mediaCount = 0, nowTs = Date.now() }) {
  const warnings = [];
  const ownerType = String(equipment?.ownerType || '').trim();

  if (ownerType === 'client' && !equipment?.serial) warnings.push('missing_serial_for_client');
  if (ownerType === 'company' && !equipment?.internalNumber) warnings.push('missing_internal_for_company');
  if (mediaCount === 0) warnings.push('missing_media');
  if (!activeCase) warnings.push('missing_active_service_case');
  if (activeCase?.serviceStatus === 'ready' && (nowTs - new Date(activeCase.updatedAt).getTime()) > 24 * 3600000) warnings.push('stale_ready');

  const serviceStatus = String(equipment?.serviceStatus || '').trim();
  const hasLiveServiceStatus = ['accepted', 'in_progress', 'testing', 'ready'].includes(serviceStatus);
  const statusesConflict = (activeCase && serviceStatus && activeCase.serviceStatus !== serviceStatus)
    || (!activeCase && hasLiveServiceStatus)
    || (activeCase && ['processed', 'closed'].includes(serviceStatus));
  if (statusesConflict) warnings.push('inconsistent_status_data');

  return warnings;
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

  async deleteReportPresetByKey(key) {
    if (!key) return null;
    try {
      const removed = await this.prisma.reportPreset.delete({ where: { key } });
      return {
        ...removed,
        createdAt: removed.createdAt?.toISOString?.() || removed.createdAt,
        updatedAt: removed.updatedAt?.toISOString?.() || removed.updatedAt,
      };
    } catch {
      return null;
    }
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
      include: {
        equipment: true,
        assignedToUser: true,
        assignedByUser: true,
        processedByUser: true,
        media: { include: { uploadedByUser: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
    const equipmentIds = Array.from(new Set(rows.map((item) => item.equipmentId).filter(Boolean)));
    const latestEquipmentMediaRows = equipmentIds.length
      ? await this.prisma.serviceCaseMedia.findMany({
        where: { equipmentId: { in: equipmentIds } },
        include: { uploadedByUser: true },
        orderBy: { createdAt: 'desc' },
      })
      : [];
    const latestEquipmentMediaByEquipmentId = new Map();
    for (const row of latestEquipmentMediaRows) {
      if (!row.equipmentId || latestEquipmentMediaByEquipmentId.has(row.equipmentId)) continue;
      latestEquipmentMediaByEquipmentId.set(row.equipmentId, mapMedia(row));
    }

    return rows.map((item) => {
      const mapped = mapCase(item);
      const equipmentCover = latestEquipmentMediaByEquipmentId.get(item.equipmentId) || null;
      if (!mapped?.equipment || !equipmentCover) return mapped;
      return {
        ...mapped,
        equipment: {
          ...mapped.equipment,
          previewUrl: equipmentCover.previewUrl || equipmentCover.fileUrl || '',
          media: [equipmentCover],
        },
      };
    });
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
    const equipmentCoverRow = row?.equipmentId
      ? await this.prisma.serviceCaseMedia.findFirst({
        where: { equipmentId: row.equipmentId },
        include: { uploadedByUser: true },
        orderBy: { createdAt: 'desc' },
      })
      : null;
    const equipmentCover = mapMedia(equipmentCoverRow);
    const auditTrail = buildAuditTrail(row);
    return {
      ...mapped,
      equipment: mapped.equipment ? {
        ...mapped.equipment,
        previewUrl: equipmentCover?.previewUrl || equipmentCover?.fileUrl || mapped.equipment.previewUrl || '',
        media: equipmentCover ? [equipmentCover] : (mapped.equipment.media || []),
      } : mapped.equipment,
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

  async deleteMediaById(id) {
    const row = await this.prisma.serviceCaseMedia.findUnique({ where: { id } });
    if (!row) return null;
    await this.prisma.serviceCaseMedia.delete({ where: { id } });
    return mapMedia(row);
  }

  async deleteEquipmentById(id) {
    const row = await this.prisma.equipment.findUnique({ where: { id } });
    if (!row) return null;
    await this.prisma.equipment.delete({ where: { id } });
    return mapEquipment(row);
  }

  async updateEquipmentById(id, patch = {}) {
    const current = await this.prisma.equipment.findUnique({ where: { id } });
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.equipment.update({
        where: { id },
        data: {
          ...(patch.brand !== undefined ? { brand: patch.brand || '' } : {}),
          ...(patch.model !== undefined ? { model: patch.model || null } : {}),
          ...(patch.serial !== undefined ? { serial: patch.serial || null } : {}),
          ...(patch.internalNumber !== undefined ? { internalNumber: patch.internalNumber || null } : {}),
          ...(patch.clientName !== undefined ? { clientName: patch.clientName || null } : {}),
          ...(patch.clientPhone !== undefined ? { clientPhone: patch.clientPhone || null } : {}),
          ...(patch.clientLocation !== undefined ? { clientLocation: patch.clientLocation || null } : {}),
          ...(patch.companyLocation !== undefined ? { companyLocation: patch.companyLocation || null } : {}),
          ...(patch.ownerType !== undefined ? { ownerType: patch.ownerType || null } : {}),
          ...(patch.equipmentType !== undefined ? { equipmentType: patch.equipmentType || null } : {}),
          ...(patch.name !== undefined ? { name: patch.name || null } : {}),
          ...(patch.clientId !== undefined ? { clientId: patch.clientId || null } : {}),
          ...(patch.networkId !== undefined ? { networkId: patch.networkId || null } : {}),
          ...(patch.locationId !== undefined ? { locationId: patch.locationId || null } : {}),
          ...(patch.currentPlacement !== undefined ? { currentPlacement: patch.currentPlacement || null } : {}),
        },
        include: { client: true, location: true, network: true },
      });
      const placementChanged = current && (
        current.clientId !== updated.clientId
        || current.locationId !== updated.locationId
        || current.ownerType !== updated.ownerType
        || current.currentPlacement !== updated.currentPlacement
      );
      if (placementChanged) {
        await this.recordEquipmentPlacement(tx, updated, {
          changedByUserId: patch.changedByUserId || null,
          comment: patch.comment || 'Equipment placement updated',
        });
      }
      return updated;
    });
    return mapEquipment(row);
  }

  async ensureSurpressoContext(tx = this.prisma) {
    const client = await tx.client.upsert({
      where: { id: 'client-surpresso' },
      update: { companyName: 'Surpresso', contactName: 'Surpresso', isActive: true },
      create: {
        id: 'client-surpresso',
        telegramUserId: 'surpresso-company',
        companyName: 'Surpresso',
        contactName: 'Surpresso',
        phone: '',
        isActive: true,
      },
    });
    const network = await tx.network.upsert({
      where: { id: 'network-surpresso' },
      update: { name: 'Surpresso', legalName: 'Surpresso', isActive: true },
      create: {
        id: 'network-surpresso',
        name: 'Surpresso',
        legalName: 'Surpresso',
        isActive: true,
      },
    });
    const location = await tx.location.upsert({
      where: { id: 'location-surpresso-workshop' },
      update: { networkId: network.id, name: 'Surpresso', address: 'Surpresso', isActive: true },
      create: {
        id: 'location-surpresso-workshop',
        networkId: network.id,
        code: 'SURPRESSO',
        name: 'Surpresso',
        address: 'Surpresso',
        isActive: true,
      },
    });
    return { client, network, location };
  }

  async ensureEquipmentClientContext(tx, payload = {}) {
    if (payload.clientId && payload.locationId) {
      const [client, location] = await Promise.all([
        tx.client.findUnique({ where: { id: payload.clientId } }),
        tx.location.findUnique({ where: { id: payload.locationId }, include: { network: true } }),
      ]);
      if (client && location) return { client, network: location.network, location };
    }

    if (payload.ownerType === 'client') {
      const companyName = String(payload.clientName || payload.companyName || '').trim();
      const phone = String(payload.clientPhone || payload.phone || '').trim();
      const locationName = String(payload.locationName || payload.clientLocation || payload.locationAddress || '').trim();
      if (!companyName || !locationName) throw new Error('client_location_required');

      const client = await tx.client.create({
        data: {
          id: `client-equipment-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          telegramUserId: `equipment-manual-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          companyName,
          contactName: String(payload.contactName || companyName).trim(),
          phone,
          isActive: true,
        },
      });
      const network = await tx.network.create({
        data: {
          id: `network-equipment-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          name: companyName,
          legalName: companyName,
          isActive: true,
        },
      });
      const location = await tx.location.create({
        data: {
          id: `location-equipment-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          networkId: network.id,
          name: locationName,
          address: String(payload.locationAddress || payload.clientLocation || '').trim() || null,
          isActive: true,
        },
      });
      return { client, network, location };
    }

    return this.ensureSurpressoContext(tx);
  }

  async recordEquipmentPlacement(tx, equipment, meta = {}) {
    const startedAt = meta.startedAt ? new Date(meta.startedAt) : new Date();
    await tx.equipmentPlacementHistory.updateMany({
      where: { equipmentId: equipment.id, endedAt: null },
      data: { endedAt: startedAt },
    });
    await tx.equipmentPlacementHistory.create({
      data: {
        id: `eph-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        equipmentId: equipment.id,
        clientId: equipment.clientId || null,
        locationId: equipment.locationId || null,
        serviceRequestId: meta.serviceRequestId || null,
        ownerType: equipment.ownerType || 'company',
        placement: equipment.currentPlacement || (equipment.ownerType === 'client' ? 'at_location' : 'workshop'),
        label: meta.label || getPlacementLabel({ client: equipment.client, location: equipment.location, fallback: equipment.companyLocation || equipment.clientName || 'Surpresso' }),
        startedAt,
        changedByUserId: meta.changedByUserId || null,
        comment: meta.comment || null,
      },
    });
  }

  async moveEquipmentToRequestLocation(equipmentId, { clientId, locationId, serviceRequestId, changedByUserId, comment } = {}) {
    if (!equipmentId || !clientId || !locationId) return null;
    return this.prisma.$transaction(async (tx) => {
      const [client, location] = await Promise.all([
        tx.client.findUnique({ where: { id: clientId } }),
        tx.location.findUnique({ where: { id: locationId }, include: { network: true } }),
      ]);
      if (!client || !location) return null;
      const updated = await tx.equipment.update({
        where: { id: equipmentId },
        data: {
          clientId: client.id,
          networkId: location.networkId,
          locationId: location.id,
          ownerType: 'client',
          currentPlacement: 'at_location',
          clientName: client.companyName,
          clientPhone: client.phone,
          clientLocation: location.address || location.name,
          companyLocation: null,
        },
        include: { client: true, location: true, network: true },
      });
      await this.recordEquipmentPlacement(tx, updated, {
        serviceRequestId,
        changedByUserId,
        comment: comment || 'Mounted to client location',
      });
      return mapEquipment(updated);
    });
  }

  async moveEquipmentToSurpresso(equipmentId, { serviceRequestId, changedByUserId, comment } = {}) {
    if (!equipmentId) return null;
    return this.prisma.$transaction(async (tx) => {
      const context = await this.ensureSurpressoContext(tx);
      const updated = await tx.equipment.update({
        where: { id: equipmentId },
        data: {
          clientId: context.client.id,
          networkId: context.network.id,
          locationId: context.location.id,
          ownerType: 'company',
          currentPlacement: 'workshop',
          clientName: 'Surpresso',
          clientPhone: '',
          clientLocation: null,
          companyLocation: 'Surpresso',
        },
        include: { client: true, location: true, network: true },
      });
      await this.recordEquipmentPlacement(tx, updated, {
        serviceRequestId,
        changedByUserId,
        comment: comment || 'Returned to Surpresso',
      });
      return mapEquipment(updated);
    });
  }

  async addEquipmentComment(equipmentId, payload = {}) {
    const row = await this.prisma.equipmentComment.create({
      data: {
        id: `eqc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        equipmentId,
        authorUserId: payload.authorUserId || null,
        body: payload.body,
      },
      include: { authorUser: true },
    });
    return mapEquipmentComment(row);
  }

  async addEquipmentNote(equipmentId, payload = {}) {
    const row = await this.prisma.equipmentNote.create({
      data: {
        id: `eqn-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        equipmentId,
        authorUserId: payload.authorUserId || null,
        body: payload.body,
      },
      include: { authorUser: true },
    });
    return mapEquipmentComment(row);
  }

  async createServiceTask(payload = {}) {
    const row = await this.prisma.serviceTask.create({
      data: {
        id: payload.id || `st-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        serviceCaseId: payload.serviceCaseId || null,
        equipmentId: payload.equipmentId || null,
        title: payload.title,
        description: payload.description || null,
        status: payload.status || 'todo',
        assignedToUserId: payload.assignedToUserId || null,
        createdByUserId: payload.createdByUserId || null,
        dueAt: payload.dueAt ? new Date(payload.dueAt) : null,
      },
      include: { assignedToUser: true, createdByUser: true },
    });
    return mapTask(row);
  }

  async listServiceTasks(filters = {}) {
    const rows = await this.prisma.serviceTask.findMany({
      where: {
        ...(filters.equipmentId ? { equipmentId: filters.equipmentId } : {}),
        ...(filters.serviceCaseId ? { serviceCaseId: filters.serviceCaseId } : {}),
      },
      include: { assignedToUser: true, createdByUser: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapTask);
  }

  async updateServiceTaskStatus(id, status) {
    const row = await this.prisma.serviceTask.update({
      where: { id },
      data: { status },
      include: { assignedToUser: true, createdByUser: true },
    });
    return mapTask(row);
  }

  async createEquipmentWithIntake(payload = {}) {
    return this.prisma.$transaction(async (tx) => {
      const context = await this.ensureEquipmentClientContext(tx, payload);
      const ownerType = payload.ownerType || 'company';
      const currentPlacement = ownerType === 'client' ? 'at_location' : 'workshop';
      const equipment = await tx.equipment.create({
        data: {
          id: payload.equipmentId || `eq-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          clientId: context.client.id,
          networkId: context.network.id,
          locationId: context.location.id,
          type: payload.type || 'service',
          brand: payload.brand || 'Unknown',
          model: payload.model || null,
          name: payload.name || null,
          serial: payload.serial || null,
          internalNumber: payload.internalNumber || null,
          status: payload.status || 'accepted',
          ownerType,
          equipmentType: payload.equipmentType || null,
          serviceStatus: payload.serviceStatus || 'accepted',
          commercialStatus: payload.commercialStatus || null,
          currentStatusRaw: payload.serviceStatus || 'accepted',
          currentPlacement,
          clientName: ownerType === 'client' ? context.client.companyName : 'Surpresso',
          clientPhone: ownerType === 'client' ? context.client.phone : '',
          clientLocation: ownerType === 'client' ? (context.location.address || context.location.name) : null,
          companyLocation: ownerType === 'company' ? 'Surpresso' : null,
          lastComment: payload.problemDescription || payload.intakeComment || null,
        },
      });

      const serviceCase = await tx.serviceCase.create({
        data: {
          id: payload.serviceCaseId || `sc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          equipmentId: equipment.id,
          intakeType: payload.intakeType || 'manual_intake',
          serviceStatus: payload.serviceStatus || 'accepted',
          problemDescription: payload.problemDescription || null,
          damageDescription: payload.damageDescription || null,
          intakeComment: payload.intakeComment || null,
          ownerTypeSnapshot: payload.ownerType || null,
          clientNameSnapshot: payload.clientName || null,
          clientPhoneSnapshot: payload.clientPhone || null,
          clientLocationSnapshot: payload.clientLocation || null,
          companyLocationSnapshot: payload.companyLocation || null,
          modelSnapshot: payload.model || null,
          serialNumberSnapshot: payload.serial || null,
          internalNumberSnapshot: payload.internalNumber || null,
          acceptedAt: new Date(),
        },
      });

      await tx.serviceStatusHistory.create({
        data: {
          id: `ssh-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          equipmentId: equipment.id,
          serviceCaseId: serviceCase.id,
          toStatusRaw: payload.serviceStatus || 'accepted',
          toServiceStatus: payload.serviceStatus || 'accepted',
          comment: payload.problemDescription || payload.intakeComment || 'Intake created',
          actorLabel: payload.actorLabel || null,
          changedByUserId: payload.changedByUserId || null,
        },
      });

      await this.recordEquipmentPlacement(tx, {
        ...equipment,
        client: context.client,
        location: context.location,
      }, {
        changedByUserId: payload.changedByUserId || null,
        comment: payload.problemDescription || payload.intakeComment || 'Initial placement',
      });

      return { equipment: mapEquipment(equipment), serviceCase: mapCase(serviceCase) };
    });
  }

  async createEquipmentCard(payload = {}) {
    const row = await this.prisma.$transaction(async (tx) => {
      const context = await this.ensureEquipmentClientContext(tx, payload);
      const ownerType = payload.ownerType || 'company';
      const currentPlacement = ownerType === 'client' ? 'at_location' : 'workshop';
      const equipment = await tx.equipment.create({
        data: {
          id: payload.equipmentId || `eq-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          clientId: context.client.id,
          networkId: context.network.id,
          locationId: context.location.id,
          type: payload.type || 'service',
          brand: payload.brand || 'Unknown',
          model: payload.model || null,
          name: payload.name || null,
          serial: payload.serial || null,
          internalNumber: payload.internalNumber || null,
          status: payload.status || 'registered',
          ownerType,
          equipmentType: payload.equipmentType || null,
          serviceStatus: payload.serviceStatus || null,
          commercialStatus: payload.commercialStatus || null,
          currentStatusRaw: payload.currentStatusRaw || payload.serviceStatus || 'registered',
          currentPlacement,
          clientName: ownerType === 'client' ? context.client.companyName : 'Surpresso',
          clientPhone: ownerType === 'client' ? context.client.phone : '',
          clientLocation: ownerType === 'client' ? (context.location.address || context.location.name) : null,
          companyLocation: ownerType === 'company' ? 'Surpresso' : null,
        },
        include: { client: true, location: true, network: true },
      });
      await this.recordEquipmentPlacement(tx, equipment, {
        changedByUserId: payload.changedByUserId || null,
        comment: payload.comment || 'Equipment card created',
      });
      return equipment;
    });
    return mapEquipment(row);
  }

  async equipmentDashboard() {
    const [equipmentRows, activeServiceCases, mediaBuckets] = await Promise.all([
      this.prisma.equipment.findMany({
        select: {
          id: true,
          ownerType: true,
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
      missing_serial_for_client: 0,
      missing_internal_for_company: 0,
      missing_media: 0,
      missing_active_service_case: 0,
      stale_ready: 0,
      inconsistent_status_data: 0,
    };

    for (const equipment of equipmentRows) {
      const activeCase = activeByEquipmentId.get(equipment.id) || null;
      const mediaCount = mediaCountByEquipmentId.get(equipment.id) || 0;
      const warnings = evaluateEquipmentWarnings({ equipment, activeCase, mediaCount, nowTs });
      warnings.forEach((warningKey) => {
        if (Object.prototype.hasOwnProperty.call(alertCounters, warningKey)) {
          alertCounters[warningKey] += 1;
        }
      });
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
    const search = String(filters.search || filters.q || '').trim();
    const rows = await this.prisma.equipment.findMany({
      where: {
        ...(filters.ownerType ? { ownerType: filters.ownerType } : {}),
        ...(filters.clientServiceType ? { clientServiceType: filters.clientServiceType } : {}),
        ...(filters.equipmentType ? { equipmentType: filters.equipmentType } : {}),
        ...(filters.serviceStatus ? { serviceStatus: filters.serviceStatus } : {}),
        ...(filters.commercialStatus ? { commercialStatus: filters.commercialStatus } : {}),
        ...(search ? {
          OR: [
            { id: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
            { brand: { contains: search, mode: 'insensitive' } },
            { model: { contains: search, mode: 'insensitive' } },
            { serial: { contains: search, mode: 'insensitive' } },
            { internalNumber: { contains: search, mode: 'insensitive' } },
            { clientName: { contains: search, mode: 'insensitive' } },
            { clientLocation: { contains: search, mode: 'insensitive' } },
            { companyLocation: { contains: search, mode: 'insensitive' } },
          ],
        } : {}),
      },
      include: { client: true, location: true, network: true },
      orderBy: { updatedAt: 'desc' },
    });

    const ids = rows.map((item) => item.id);
    const [activeCases, mediaBuckets, latestMediaRows] = ids.length ? await Promise.all([
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
      this.prisma.serviceCaseMedia.findMany({
        where: { equipmentId: { in: ids } },
        include: { uploadedByUser: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]) : [[], [], []];

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
    const latestMediaByEquipmentId = new Map();
    for (const row of latestMediaRows) {
      if (!row.equipmentId || latestMediaByEquipmentId.has(row.equipmentId)) continue;
      latestMediaByEquipmentId.set(row.equipmentId, mapMedia(row));
    }

    return rows.map((item) => {
      const mapped = mapEquipment(item);
      const activeCase = activeByEquipmentId.get(item.id) || null;
      const warnings = evaluateEquipmentWarnings({
        equipment: item,
        activeCase,
        mediaCount: mediaCountByEquipmentId.get(item.id) || 0,
      });
      const listItem = {
        ...mapped,
        media: latestMediaByEquipmentId.has(item.id) ? [latestMediaByEquipmentId.get(item.id)] : [],
        previewUrl: latestMediaByEquipmentId.get(item.id)?.fileUrl || '',
        activeServiceCaseId: activeCase?.id || null,
        activeServiceCaseStatus: activeCase?.serviceStatus || null,
        warnings,
      };
      if (!filters.warning) return listItem;
      return warnings.includes(String(filters.warning || '')) ? listItem : null;
    }).filter(Boolean);
  }

  async getEquipmentById(id) {
    const row = await this.prisma.equipment.findUnique({ where: { id }, include: { client: true, location: true, network: true } });
    return mapEquipment(row);
  }

  async listClients(filters = {}) {
    const search = String(filters.search || filters.q || '').trim();
    const rows = await this.prisma.client.findMany({
      where: search
        ? {
            OR: [
              { companyName: { contains: search, mode: 'insensitive' } },
              { contactName: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
              { equipment: { some: { OR: [
                { brand: { contains: search, mode: 'insensitive' } },
                { model: { contains: search, mode: 'insensitive' } },
                { serial: { contains: search, mode: 'insensitive' } },
                { internalNumber: { contains: search, mode: 'insensitive' } },
              ] } } },
            ],
          }
        : undefined,
      include: {
        equipment: { include: { location: true }, orderBy: { updatedAt: 'desc' } },
        _count: { select: { equipment: true, serviceRequests: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(mapClientSummary);
  }

  async getClientDetail(id) {
    const row = await this.prisma.client.findUnique({
      where: { id },
      include: {
        equipment: { include: { location: true, network: true }, orderBy: { updatedAt: 'desc' } },
        serviceRequests: { orderBy: { updatedAt: 'desc' }, take: 20 },
        _count: { select: { equipment: true, serviceRequests: true } },
      },
    });
    if (!row) return null;
    return {
      ...mapClientSummary(row),
      equipment: row.equipment.map(mapEquipment),
      serviceRequests: row.serviceRequests.map((request) => ({
        id: request.id,
        title: request.title,
        description: request.description,
        status: request.status,
        urgency: request.urgency,
        createdAt: request.createdAt?.toISOString?.() || request.createdAt,
        updatedAt: request.updatedAt?.toISOString?.() || request.updatedAt,
      })),
    };
  }

  async createClientWithLocation(payload = {}) {
    const companyName = String(payload.companyName || '').trim();
    if (!companyName) throw new Error('company_name_required');
    const contactName = String(payload.contactName || '').trim() || companyName;
    const phone = String(payload.phone || '').trim();
    const locationName = String(payload.locationName || '').trim();
    const locationAddress = String(payload.locationAddress || '').trim();

    const created = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          id: `client-admin-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          telegramUserId: `admin-client-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          companyName,
          contactName,
          phone,
          isActive: true,
        },
      });
      let location = null;
      if (locationName || locationAddress) {
        const network = await tx.network.create({
          data: {
            id: `network-admin-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            name: companyName,
            legalName: companyName,
            isActive: true,
          },
        });
        location = await tx.location.create({
          data: {
            id: `location-admin-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            networkId: network.id,
            name: locationName || companyName,
            address: locationAddress || null,
            isActive: true,
          },
        });
      }
      return { client, location };
    });
    return { client: mapClientSummary({ ...created.client, equipment: [], _count: { equipment: 0, serviceRequests: 0 } }), location: created.location };
  }

  async updateClientWithLocation(id, payload = {}) {
    const companyName = payload.companyName !== undefined ? String(payload.companyName || '').trim() : undefined;
    const contactName = payload.contactName !== undefined ? String(payload.contactName || '').trim() : undefined;
    const phone = payload.phone !== undefined ? String(payload.phone || '').trim() : undefined;
    const locationId = String(payload.locationId || '').trim();
    const locationName = payload.locationName !== undefined ? String(payload.locationName || '').trim() : undefined;
    const locationAddress = payload.locationAddress !== undefined ? String(payload.locationAddress || '').trim() : undefined;
    if (companyName !== undefined && !companyName) throw new Error('company_name_required');

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.client.findUnique({ where: { id } });
      if (!existing) throw new Error('client_not_found');
      const nextCompanyName = companyName ?? existing.companyName;
      const nextPhone = phone ?? existing.phone;

      await tx.client.update({
        where: { id },
        data: {
          ...(companyName !== undefined ? { companyName } : {}),
          ...(contactName !== undefined ? { contactName: contactName || nextCompanyName } : {}),
          ...(phone !== undefined ? { phone } : {}),
        },
      });

      await tx.equipment.updateMany({
        where: { clientId: id },
        data: {
          clientName: nextCompanyName,
          clientPhone: nextPhone,
        },
      });

      if (locationId) {
        const updatedLocation = await tx.location.update({
          where: { id: locationId },
          data: {
            ...(locationName !== undefined ? { name: locationName || nextCompanyName } : {}),
            ...(locationAddress !== undefined ? { address: locationAddress || null } : {}),
          },
        });
        await tx.equipment.updateMany({
          where: { clientId: id, locationId },
          data: {
            clientLocation: updatedLocation.address || updatedLocation.name,
          },
        });
      }
    });

    return this.getClientDetail(id);
  }

  async deleteClientById(id) {
    const row = await this.prisma.client.findUnique({
      where: { id },
      include: { _count: { select: { equipment: true, serviceRequests: true } } },
    });
    if (!row) return null;
    if ((row._count?.equipment || 0) > 0 || (row._count?.serviceRequests || 0) > 0) {
      throw new Error('client_has_links');
    }
    await this.prisma.client.delete({ where: { id } });
    return mapClientSummary({ ...row, equipment: [], _count: row._count });
  }

  async linkEquipmentToClient(clientId, payload = {}) {
    const equipmentId = String(payload.equipmentId || '').trim();
    if (!clientId) throw new Error('client_required');
    if (!equipmentId) throw new Error('equipment_required');

    return this.prisma.$transaction(async (tx) => {
      const [client, equipment] = await Promise.all([
        tx.client.findUnique({ where: { id: clientId } }),
        tx.equipment.findUnique({ where: { id: equipmentId } }),
      ]);
      if (!client) throw new Error('client_not_found');
      if (!equipment) throw new Error('equipment_not_found');

      let location = null;
      const locationId = String(payload.locationId || '').trim();
      if (locationId) {
        location = await tx.location.findUnique({ where: { id: locationId }, include: { network: true } });
        if (!location) throw new Error('location_not_found');
      }

      if (!location) {
        const locationName = String(payload.locationName || payload.locationAddress || client.companyName || '').trim();
        const locationAddress = String(payload.locationAddress || '').trim();
        const existingNetworkId = payload.networkId
          || equipment.networkId
          || (await tx.equipment.findFirst({ where: { clientId }, select: { networkId: true } }))?.networkId
          || null;
        const network = existingNetworkId
          ? await tx.network.findUnique({ where: { id: existingNetworkId } })
          : await tx.network.create({
              data: {
                id: `network-client-link-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                name: client.companyName,
                legalName: client.companyName,
                isActive: true,
              },
            });
        if (!network) throw new Error('network_not_found');
        location = await tx.location.create({
          data: {
            id: `location-client-link-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            networkId: network.id,
            name: locationName || client.companyName,
            address: locationAddress || null,
            isActive: true,
          },
          include: { network: true },
        });
      }

      const updated = await tx.equipment.update({
        where: { id: equipment.id },
        data: {
          clientId: client.id,
          networkId: location.networkId,
          locationId: location.id,
          ownerType: 'client',
          currentPlacement: 'at_location',
          clientName: client.companyName,
          clientPhone: client.phone,
          clientLocation: location.address || location.name,
          companyLocation: null,
        },
        include: { client: true, location: true, network: true },
      });

      await this.recordEquipmentPlacement(tx, updated, {
        changedByUserId: payload.changedByUserId || null,
        comment: payload.comment || 'Equipment linked to client card',
      });

      return mapEquipment(updated);
    });
  }

  async getEquipmentDetail(id) {
    const equipmentRow = await this.prisma.equipment.findUnique({ where: { id }, include: { client: true, location: true, network: true } });
    if (!equipmentRow) return null;

    const [serviceCasesRows, mediaRows, historyRows, placementHistoryRows, notesRows, commentsRows, equipmentNotesRows, tasksRows, serviceRequestsRows, telegramPostsRows] = await Promise.all([
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
      this.prisma.equipmentPlacementHistory.findMany({
        where: { equipmentId: id },
        include: { client: true, location: true, changedByUser: true },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.serviceCaseNote.findMany({
        where: { serviceCase: { equipmentId: id } },
        include: { authorUser: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.equipmentComment.findMany({
        where: { equipmentId: id },
        include: { authorUser: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.equipmentNote.findMany({
        where: { equipmentId: id },
        include: { authorUser: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.serviceTask.findMany({
        where: {
          OR: [
            { equipmentId: id },
            { serviceCase: { equipmentId: id } },
          ],
        },
        include: { assignedToUser: true, createdByUser: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.serviceRequest.findMany({
        where: { equipmentId: id },
        include: { assignedToUser: true, client: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.telegramPost.findMany({
        where: {
          equipmentId: id,
          kind: { in: ['equipment_post', 'equipment_intake', 'equipment_move'] },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
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
      placementHistory: placementHistoryRows.map(mapPlacementHistory),
      serviceCases,
      notes: notesRows.map((row) => ({ ...mapNote(row), serviceCaseId: row.serviceCaseId })),
      comments: commentsRows.map(mapEquipmentComment),
      equipmentNotes: equipmentNotesRows.map(mapEquipmentComment),
      tasks: tasksRows.map(mapTask),
      serviceRequests: serviceRequestsRows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        status: row.status,
        urgency: row.urgency,
        category: row.category,
        clientName: row.client?.name || row.clientName || null,
        assignedToUser: row.assignedToUser ? { id: row.assignedToUser.id, fullName: row.assignedToUser.fullName, role: row.assignedToUser.role } : null,
        createdAt: row.createdAt?.toISOString?.() || row.createdAt,
        updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt,
      })),
      telegramPost: telegramPostsRows[0] ? mapTelegramPost(telegramPostsRows[0]) : null,
      telegramPosts: telegramPostsRows.map(mapTelegramPost),
      activeServiceCaseId: serviceCases.find((row) => row.isActive)?.id || null,
    };
  }

  async createTelegramPost(payload = {}) {
    if (!payload.equipmentId || !payload.chatId || !payload.messageId || !String(payload.text || '').trim()) return null;
    return this.prisma.telegramPost.create({
      data: {
        id: payload.id || makeTelegramPostId(),
        equipmentId: payload.equipmentId,
        serviceCaseId: payload.serviceCaseId || null,
        kind: String(payload.kind || 'equipment_post').trim() || 'equipment_post',
        messageType: String(payload.messageType || 'text').trim() || 'text',
        broadcastKey: payload.broadcastKey || makeTelegramBroadcastKey(),
        chatId: String(payload.chatId),
        messageId: Number(payload.messageId),
        text: String(payload.text || ''),
        createdByUserId: payload.createdByUserId || null,
        editedAt: payload.editedAt || null,
        editCount: Number(payload.editCount || 0),
      },
    });
  }

  async updateTelegramPost(id, patch = {}) {
    const current = await this.prisma.telegramPost.findUnique({ where: { id } });
    if (!current) return null;
    return this.prisma.telegramPost.update({
      where: { id },
      data: {
        ...(patch.text !== undefined ? { text: String(patch.text || '') } : {}),
        ...(patch.messageType !== undefined ? { messageType: String(patch.messageType || 'text') } : {}),
        ...(patch.editedAt !== undefined ? { editedAt: patch.editedAt } : {}),
        ...(patch.editCount !== undefined ? { editCount: Number(patch.editCount || 0) } : {}),
      },
    });
  }

  async findLatestTelegramPostGroup({ equipmentId, kinds = ['equipment_post', 'equipment_intake', 'equipment_move'] } = {}) {
    const normalizedKinds = normalizeTelegramKinds(kinds);
    if (!equipmentId || !normalizedKinds.length) return null;
    const latest = await this.prisma.telegramPost.findFirst({
      where: {
        equipmentId,
        kind: { in: normalizedKinds },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (!latest) return null;
    const posts = await this.prisma.telegramPost.findMany({
      where: { broadcastKey: latest.broadcastKey },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return {
      broadcastKey: latest.broadcastKey,
      kind: latest.kind,
      messageType: latest.messageType || 'text',
      text: latest.text,
      createdAt: latest.createdAt?.toISOString?.() || latest.createdAt,
      items: posts.map(mapTelegramPost),
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
    this.telegramPosts = [];
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
  async deleteMediaById() { return null; }
  async deleteEquipmentById() { return null; }
  async updateEquipmentById() { return null; }
  async addEquipmentComment() { return null; }
  async addEquipmentNote() { return null; }
  async createServiceTask() { return null; }
  async listServiceTasks() { return []; }
  async updateServiceTaskStatus() { return null; }
  async createEquipmentWithIntake() { return { equipment: null, serviceCase: null }; }
  async createEquipmentCard() { return null; }
  async updateClientWithLocation() { return null; }
  async deleteClientById() { return null; }
  async linkEquipmentToClient() { return null; }
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
        { key: 'missing_serial_for_client', count: 0 },
        { key: 'missing_internal_for_company', count: 0 },
        { key: 'missing_media', count: 0 },
        { key: 'missing_active_service_case', count: 0 },
        { key: 'stale_ready', count: 0 },
        { key: 'inconsistent_status_data', count: 0 },
      ],
    };
  }
  async listEquipment() { return []; }
  async getEquipmentById() { return null; }
  async getEquipmentDetail() { return null; }
  async createTelegramPost(payload = {}) {
    if (!payload.equipmentId || !payload.chatId || !payload.messageId || !String(payload.text || '').trim()) return null;
    const row = {
      id: payload.id || makeTelegramPostId(),
      equipmentId: payload.equipmentId,
      serviceCaseId: payload.serviceCaseId || null,
      kind: String(payload.kind || 'equipment_post').trim() || 'equipment_post',
      messageType: String(payload.messageType || 'text').trim() || 'text',
      broadcastKey: payload.broadcastKey || makeTelegramBroadcastKey(),
      chatId: String(payload.chatId),
      messageId: Number(payload.messageId),
      text: String(payload.text || ''),
      createdByUserId: payload.createdByUserId || null,
      createdAt: payload.createdAt || new Date().toISOString(),
      updatedAt: payload.updatedAt || new Date().toISOString(),
      editedAt: payload.editedAt || null,
      editCount: Number(payload.editCount || 0),
    };
    this.telegramPosts.unshift(row);
    return row;
  }
  async updateTelegramPost(id, patch = {}) {
    const idx = this.telegramPosts.findIndex((item) => item.id === id);
    if (idx < 0) return null;
    this.telegramPosts[idx] = {
      ...this.telegramPosts[idx],
      ...(patch.text !== undefined ? { text: String(patch.text || '') } : {}),
      ...(patch.editedAt !== undefined ? { editedAt: patch.editedAt } : {}),
      ...(patch.editCount !== undefined ? { editCount: Number(patch.editCount || 0) } : {}),
      updatedAt: new Date().toISOString(),
    };
    return this.telegramPosts[idx];
  }
  async findLatestTelegramPostGroup({ equipmentId, kinds = ['equipment_post', 'equipment_intake', 'equipment_move'] } = {}) {
    const normalizedKinds = normalizeTelegramKinds(kinds);
    const latest = this.telegramPosts.find((item) => item.equipmentId === equipmentId && normalizedKinds.includes(item.kind));
    if (!latest) return null;
    const items = this.telegramPosts
      .filter((item) => item.broadcastKey === latest.broadcastKey)
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((item) => mapTelegramPost(item));
    return {
      broadcastKey: latest.broadcastKey,
      kind: latest.kind,
      messageType: latest.messageType || 'text',
      text: latest.text,
      createdAt: latest.createdAt,
      items,
    };
  }
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

  async deleteReportPresetByKey(key) {
    const idx = this.reportPresets.findIndex((item) => item.key === key);
    if (idx < 0) return null;
    const [removed] = this.reportPresets.splice(idx, 1);
    return removed || null;
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
