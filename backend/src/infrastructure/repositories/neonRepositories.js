function mapClient(client) {
  if (!client) return null;
  return {
    ...client,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}

function mapEquipment(item) {
  if (!item) return null;
  return {
    ...item,
    serialNumber: item.serial,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function mapServiceRequest(item) {
  if (!item) return null;
  return {
    ...item,
    canOperate: item.canOperateNow,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    client: mapClient(item.client),
    equipment: mapEquipment(item.equipment),
    media: (item.media || []).map((media) => ({
      ...media,
      createdAt: media.createdAt.toISOString(),
    })),
    history: (item.history || []).map((historyItem) => ({
      ...historyItem,
      createdAt: historyItem.createdAt.toISOString(),
    })),
    notes: (item.notes || []).map((note) => ({
      ...note,
      createdAt: note.createdAt.toISOString(),
    })),
  };
}

function mapUser(user) {
  if (!user) return null;
  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export class NeonUserRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    return mapUser(user);
  }

  async findById(id) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return mapUser(user);
  }

  async list() {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return users.map(mapUser);
  }

  async create(payload) {
    const user = await this.prisma.user.create({
      data: {
        id: payload.id || `user-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        fullName: payload.fullName,
        email: String(payload.email || '').trim().toLowerCase(),
        phone: payload.phone || '',
        passwordHash: payload.passwordHash,
        role: payload.role,
        positionTitle: payload.positionTitle || '',
        isActive: payload.isActive ?? true,
      },
    });
    return mapUser(user);
  }

  async update(id, payload) {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(payload.fullName !== undefined ? { fullName: payload.fullName } : {}),
        ...(payload.email !== undefined ? { email: String(payload.email).trim().toLowerCase() } : {}),
        ...(payload.phone !== undefined ? { phone: payload.phone } : {}),
        ...(payload.role !== undefined ? { role: payload.role } : {}),
        ...(payload.positionTitle !== undefined ? { positionTitle: payload.positionTitle } : {}),
      },
    });

    return mapUser(user);
  }

  async setActive(id, isActive) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: Boolean(isActive) },
    });
    return mapUser(user);
  }

  async setPassword(id, passwordHash) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
    return mapUser(user);
  }
}

export class NeonClientRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async findByTelegramUserId(telegramUserId) {
    const client = await this.prisma.client.findUnique({
      where: { telegramUserId: String(telegramUserId) },
    });
    return mapClient(client);
  }

  async findOrCreateFromTelegramUser(telegramUser, defaults = {}) {
    const telegramUserId = String(telegramUser?.id || '').trim();
    if (!telegramUserId) {
      return null;
    }

    const fallbackIdSuffix = Math.random().toString(16).slice(2, 8);
    const client = await this.prisma.client.upsert({
      where: { telegramUserId },
      update: {},
      create: {
        id: `client-tg-${telegramUserId}-${fallbackIdSuffix}`,
        telegramUserId,
        contactName: defaults.contactName || `Telegram user ${telegramUserId}`,
        companyName: defaults.companyName || 'Telegram client',
        phone: defaults.phone || '',
        isActive: defaults.isActive ?? true,
      },
    });

    return mapClient(client);
  }
}

export class NeonEquipmentRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async listByClientId(clientId) {
    const items = await this.prisma.equipment.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
    return items.map(mapEquipment);
  }

  async findById(id) {
    const item = await this.prisma.equipment.findUnique({ where: { id } });
    return mapEquipment(item);
  }
}

export class NeonServiceRequestRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async listByClientId(clientId) {
    const items = await this.prisma.serviceRequest.findMany({
      where: { clientId },
      include: { media: true, client: true, equipment: true },
      orderBy: { createdAt: 'desc' },
    });
    return items.map(mapServiceRequest);
  }

  async findById(id) {
    const item = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: { media: true, client: true, equipment: true },
    });
    return mapServiceRequest(item);
  }

  async listForAdmin({ status, id, client, equipment } = {}, scope = {}) {
    const where = {
      ...(status ? { status } : {}),
      ...(id ? { id: { contains: id, mode: 'insensitive' } } : {}),
      ...(scope?.serviceOnly ? { category: 'service_repair' } : {}),
      ...(scope?.assignedToUserId ? { assignedToUserId: scope.assignedToUserId } : {}),
      ...(client
        ? {
            client: {
              OR: [
                { companyName: { contains: client, mode: 'insensitive' } },
                { contactName: { contains: client, mode: 'insensitive' } },
                { phone: { contains: client, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
      ...(equipment
        ? {
            equipment: {
              OR: [
                { id: { contains: equipment, mode: 'insensitive' } },
                { brand: { contains: equipment, mode: 'insensitive' } },
                { model: { contains: equipment, mode: 'insensitive' } },
                { serial: { contains: equipment, mode: 'insensitive' } },
                { internalNumber: { contains: equipment, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const items = await this.prisma.serviceRequest.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: { media: true, client: true, equipment: true },
      orderBy: { createdAt: 'desc' },
    });
    return items.map(mapServiceRequest);
  }

  async findForAdminById(id) {
    const item = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        media: true,
        client: true,
        equipment: true,
        history: { orderBy: { createdAt: 'desc' } },
        notes: { orderBy: { createdAt: 'desc' } },
      },
    });
    return mapServiceRequest(item);
  }

  async create(payload) {
    const created = await this.prisma.serviceRequest.create({
      data: {
        id: `req-${Date.now()}`,
        clientId: payload.clientId,
        equipmentId: payload.equipmentId,
        category: payload.category,
        description: payload.description,
        urgency: payload.urgency,
        canOperateNow: Boolean(payload.canOperateNow),
        status: payload.status || 'new',
        source: payload.source || 'telegram_mini_app',
        assignedToUserId: payload.assignedToUserId || null,
        media: {
          create: (payload.media || []).map((media) => ({
            id: media.id,
            type: media.type,
            url: media.url,
          })),
        },
      },
      include: { media: true, client: true, equipment: true },
    });

    return mapServiceRequest(created);
  }

  async updateStatus(id, status, meta = {}) {
    const existing = await this.prisma.serviceRequest.findUnique({
      where: { id },
      select: { status: true },
    });
    const updated = await this.prisma.serviceRequest.update({
      where: { id },
      data: { status },
      include: { media: true, client: true, equipment: true },
    });

    await this.prisma.serviceRequestStatusHistory.create({
      data: {
        id: `srh-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        serviceRequestId: id,
        previousStatus: existing?.status || status,
        nextStatus: status,
        changedByUserId: meta.changedByUserId || null,
        changedByRole: meta.changedByRole || null,
        comment: meta.comment || null,
      },
    });

    return mapServiceRequest(updated);
  }

  async assign(id, assignedToUserId, meta = {}) {
    const updated = await this.prisma.serviceRequest.update({
      where: { id },
      data: { assignedToUserId: assignedToUserId || null },
      include: { media: true, client: true, equipment: true },
    });

    await this.prisma.serviceRequestInternalNote.create({
      data: {
        id: `srn-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        serviceRequestId: id,
        authorId: meta.changedByUserId || 'system',
        authorRole: meta.changedByRole || 'system',
        text: `Назначен ответственный: ${assignedToUserId || 'не назначен'}`,
      },
    });

    return mapServiceRequest(updated);
  }

  async listHistory(serviceRequestId) {
    const items = await this.prisma.serviceRequestStatusHistory.findMany({
      where: { serviceRequestId },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    }));
  }

  async listInternalNotes(serviceRequestId) {
    const items = await this.prisma.serviceRequestInternalNote.findMany({
      where: { serviceRequestId },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    }));
  }

  async addInternalNote(serviceRequestId, payload) {
    const note = await this.prisma.serviceRequestInternalNote.create({
      data: {
        id: `srn-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        serviceRequestId,
        authorId: payload.authorId,
        authorRole: payload.authorRole,
        text: payload.text,
      },
    });

    return {
      ...note,
      createdAt: note.createdAt.toISOString(),
    };
  }

  async analyticsSummary() {
    const [total, closed, groupedStatus, groupedCategory] = await Promise.all([
      this.prisma.serviceRequest.count(),
      this.prisma.serviceRequest.count({ where: { status: 'closed' } }),
      this.prisma.serviceRequest.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.serviceRequest.groupBy({ by: ['category'], _count: { _all: true } }),
    ]);

    const byStatus = groupedStatus.reduce((acc, item) => ({ ...acc, [item.status]: item._count._all }), {});
    const byCategory = groupedCategory.reduce((acc, item) => ({ ...acc, [item.category]: item._count._all }), {});

    return {
      totals: {
        requests: total,
        open: total - closed,
        closed,
      },
      byStatus,
      byCategory,
      kpi: {
        activeServiceEngineers: 0,
        activeSalesManagers: 0,
        avgResolutionHours: 0,
      },
      heatmap: [],
    };
  }
}
