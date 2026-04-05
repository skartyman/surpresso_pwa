import fs from 'fs/promises';
import path from 'path';
import { canTransitionServiceStatus } from '../../domain/transitions.js';
import { buildServiceStatusSideEffects } from '../../domain/serviceWorkflow.js';

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
    };
    return metrics;
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
    return rows.map(mapEquipment);
  }

  async getEquipmentById(id) {
    const row = await this.prisma.equipment.findUnique({ where: { id } });
    return mapEquipment(row);
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
    };
  }
  async listServiceCases() { return []; }
  async getServiceCaseById() { return null; }
  async assignServiceCase() { return null; }
  async updateServiceCaseStatus() { return null; }
  async addServiceCaseNote() { return null; }
  async listServiceCaseHistory() { return []; }
  async createMedia() { return null; }
  async listEquipment() { return []; }
  async getEquipmentById() { return null; }
  async updateEquipmentCommercialStatus() { return null; }
  async listEquipmentServiceCases() { return []; }
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
