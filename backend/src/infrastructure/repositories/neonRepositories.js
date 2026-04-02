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

  async listForAdmin({ status } = {}) {
    const where = status ? { status } : undefined;
    const items = await this.prisma.serviceRequest.findMany({
      where,
      include: { media: true, client: true, equipment: true },
      orderBy: { createdAt: 'desc' },
    });
    return items.map(mapServiceRequest);
  }

  async findForAdminById(id) {
    const item = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: { media: true, client: true, equipment: true },
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
        source: payload.source || 'telegram_miniapp',
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

  async updateStatus(id, status) {
    const updated = await this.prisma.serviceRequest.update({
      where: { id },
      data: { status },
      include: { media: true, client: true, equipment: true },
    });

    return mapServiceRequest(updated);
  }
}
