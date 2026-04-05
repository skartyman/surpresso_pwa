import fs from 'fs/promises';
import path from 'path';

const SERVICE_STATUS_FLOW = ['accepted', 'in_progress', 'testing', 'ready', 'processed', 'closed', 'cancelled'];

function nowIso() { return new Date().toISOString(); }

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

function canTransition(from, to) {
  if (from === to) return true;
  const fromIdx = SERVICE_STATUS_FLOW.indexOf(from);
  const toIdx = SERVICE_STATUS_FLOW.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return false;
  return toIdx >= fromIdx;
}

export class NeonServiceOpsRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async dashboard(filters = {}) {
    const where = this.buildWhere(filters);
    const cases = await this.prisma.serviceCase.findMany({ where, include: { equipment: true } });
    const metrics = {
      newCount: cases.filter((c) => c.serviceStatus === 'accepted').length,
      inProgressCount: cases.filter((c) => c.serviceStatus === 'in_progress').length,
      testingCount: cases.filter((c) => c.serviceStatus === 'testing').length,
      readyCount: cases.filter((c) => c.serviceStatus === 'ready').length,
      processedCount: cases.filter((c) => c.serviceStatus === 'processed').length,
      overdueCount: cases.filter((c) => ['accepted', 'in_progress', 'testing'].includes(c.serviceStatus) && (Date.now() - new Date(c.createdAt).getTime()) > 72 * 3600000).length,
      unassignedCount: cases.filter((c) => !c.assignedToUserId).length,
      readyForDirectorCount: cases.filter((c) => c.serviceStatus === 'ready').length,
      readyForRentCount: cases.filter((c) => c.equipment?.commercialStatus === 'ready_for_rent').length,
      readyForSaleCount: cases.filter((c) => c.equipment?.commercialStatus === 'ready_for_sale').length,
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
      include: { equipment: true, assignedToUser: true, assignedByUser: true, processedByUser: true },
    });
    return mapCase(row);
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
    if (!canTransition(existing.serviceStatus, nextStatus)) throw new Error('invalid_transition');

    const timePatch = {};
    if (nextStatus === 'testing') timePatch.testingAt = new Date();
    if (nextStatus === 'ready') timePatch.readyAt = new Date();
    if (nextStatus === 'processed') timePatch.processedAt = new Date();
    if (nextStatus === 'closed') timePatch.closedAt = new Date();

    const updated = await this.prisma.serviceCase.update({
      where: { id },
      data: {
        serviceStatus: nextStatus,
        ...timePatch,
        ...(options.closingComment !== undefined ? { closingComment: options.closingComment } : {}),
        ...(options.invoiceNumber !== undefined ? { invoiceNumber: options.invoiceNumber } : {}),
        ...(options.invoiceStatus !== undefined ? { invoiceStatus: options.invoiceStatus } : {}),
        ...(options.processedByUserId !== undefined ? { processedByUserId: options.processedByUserId } : {}),
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
    });
    return { ...row, createdAt: row.createdAt.toISOString() };
  }

  async listServiceCaseHistory(id) {
    const rows = await this.prisma.serviceStatusHistory.findMany({ where: { serviceCaseId: id }, orderBy: { changedAt: 'desc' } });
    return rows.map((r) => ({ ...r, changedAt: r.changedAt.toISOString() }));
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
    });
    return { ...row, createdAt: row.createdAt.toISOString() };
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

  async dashboard() { return { newCount: 0, inProgressCount: 0, testingCount: 0, readyCount: 0, processedCount: 0, overdueCount: 0, unassignedCount: 0, readyForDirectorCount: 0, readyForRentCount: 0, readyForSaleCount: 0 }; }
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
