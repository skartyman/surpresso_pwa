import { seed } from '../seed/mockData.js';

function withEquipmentCompatibility(item) {
  if (!item) return null;
  return {
    ...item,
    serialNumber: item.serial,
  };
}

function withRequestCompatibility(item) {
  if (!item) return null;
  return {
    ...item,
    canOperate: item.canOperateNow,
  };
}

function sanitizeUser(user) {
  return { ...user };
}

export class InMemoryUserRepository {
  constructor() {
    this.users = [...seed.users];
  }

  async findByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    return sanitizeUser(this.users.find((user) => user.email.toLowerCase() === normalized) || null);
  }

  async findById(id) {
    return sanitizeUser(this.users.find((user) => user.id === id) || null);
  }

  async list() {
    return this.users.map((user) => sanitizeUser(user));
  }

  async create(payload) {
    const now = new Date().toISOString();
    const created = {
      id: payload.id || `user-${Date.now()}`,
      fullName: payload.fullName,
      email: String(payload.email || '').trim().toLowerCase(),
      phone: payload.phone || '',
      passwordHash: payload.passwordHash,
      role: payload.role,
      positionTitle: payload.positionTitle || '',
      isActive: payload.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.users.unshift(created);
    return sanitizeUser(created);
  }

  async update(id, payload) {
    const index = this.users.findIndex((user) => user.id === id);
    if (index === -1) return null;

    this.users[index] = {
      ...this.users[index],
      ...payload,
      ...(payload.email ? { email: String(payload.email).trim().toLowerCase() } : {}),
      updatedAt: new Date().toISOString(),
    };

    return sanitizeUser(this.users[index]);
  }

  async setActive(id, isActive) {
    return this.update(id, { isActive: Boolean(isActive) });
  }

  async setPassword(id, passwordHash) {
    return this.update(id, { passwordHash });
  }
}

export class InMemoryClientRepository {
  constructor() {
    this.clients = [...seed.clients];
  }

  async findByTelegramUserId(telegramUserId) {
    return this.clients.find((client) => client.telegramUserId === String(telegramUserId)) || null;
  }

  async findOrCreateFromTelegramUser(telegramUser, defaults = {}) {
    const telegramUserId = String(telegramUser?.id || '').trim();
    if (!telegramUserId) {
      return null;
    }

    const existing = await this.findByTelegramUserId(telegramUserId);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const created = {
      id: `client-tg-${telegramUserId}-${Math.random().toString(16).slice(2, 8)}`,
      telegramUserId,
      contactName: defaults.contactName || `Telegram user ${telegramUserId}`,
      companyName: defaults.companyName || 'Telegram client',
      phone: defaults.phone || '',
      isActive: defaults.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    this.clients.unshift(created);
    return created;
  }
}

export class InMemoryEquipmentRepository {
  constructor() {
    this.equipment = [...seed.equipment];
  }

  async listByClientId(clientId) {
    return this.equipment.filter((item) => item.clientId === clientId).map(withEquipmentCompatibility);
  }

  async findById(id) {
    return withEquipmentCompatibility(this.equipment.find((item) => item.id === id) || null);
  }
}

export class InMemoryServiceRequestRepository {
  constructor() {
    this.requests = [...seed.serviceRequests];
    this.clients = [...seed.clients];
    this.equipment = [...seed.equipment];
    this.history = [...(seed.serviceRequestHistory || [])];
    this.notes = [...(seed.serviceRequestNotes || [])];
  }

  hydrate(item) {
    const request = withRequestCompatibility(item);
    if (!request) return null;

    const client = this.clients.find((entry) => entry.id === request.clientId) || null;
    const equipment = this.equipment.find((entry) => entry.id === request.equipmentId) || null;

    return {
      ...request,
      client,
      equipment: withEquipmentCompatibility(equipment),
    };
  }

  async listByClientId(clientId) {
    return this.requests.filter((item) => item.clientId === clientId).map((item) => this.hydrate(item));
  }

  async listForAdmin({ status, id, client, equipment } = {}, scope = {}) {
    const clientSearch = String(client || '').toLowerCase();
    const equipmentSearch = String(equipment || '').toLowerCase();
    return this.requests
      .filter((item) => !status || item.status === status)
      .filter((item) => !id || item.id.toLowerCase().includes(id.toLowerCase()))
      .filter((item) => {
        if (!scope?.serviceOnly) return true;
        return item.category === 'service_repair';
      })
      .filter((item) => {
        if (!scope?.assignedToUserId) return true;
        return item.assignedToUserId === scope.assignedToUserId;
      })
      .filter((item) => {
        if (!clientSearch) return true;
        const clientItem = this.clients.find((entry) => entry.id === item.clientId);
        if (!clientItem) return false;
        return `${clientItem.companyName} ${clientItem.contactName} ${clientItem.phone}`.toLowerCase().includes(clientSearch);
      })
      .filter((item) => {
        if (!equipmentSearch) return true;
        const equipmentItem = this.equipment.find((entry) => entry.id === item.equipmentId);
        if (!equipmentItem) return false;
        return `${equipmentItem.id} ${equipmentItem.brand} ${equipmentItem.model} ${equipmentItem.serial} ${equipmentItem.internalNumber}`.toLowerCase().includes(equipmentSearch);
      })
      .map((item) => this.hydrate(item));
  }

  async findById(id) {
    return this.hydrate(this.requests.find((item) => item.id === id) || null);
  }

  async findForAdminById(id) {
    return this.findById(id);
  }

  async create(payload) {
    const now = new Date().toISOString();
    const next = {
      id: `req-${Date.now()}`,
      status: 'new',
      createdAt: now,
      updatedAt: now,
      ...payload,
    };
    this.requests.unshift(next);
    return this.hydrate(next);
  }

  async updateStatus(id, status, meta = {}) {
    const index = this.requests.findIndex((item) => item.id === id);
    if (index === -1) {
      return null;
    }

    const previousStatus = this.requests[index].status;
    this.requests[index] = {
      ...this.requests[index],
      status,
      updatedAt: new Date().toISOString(),
    };

    this.history.unshift({
      id: `srh-${Date.now()}`,
      serviceRequestId: id,
      previousStatus,
      nextStatus: status,
      changedByUserId: meta.changedByUserId || null,
      changedByRole: meta.changedByRole || null,
      comment: meta.comment || null,
      createdAt: new Date().toISOString(),
    });

    return this.hydrate(this.requests[index]);
  }

  async assign(id, assignedToUserId, meta = {}) {
    const index = this.requests.findIndex((item) => item.id === id);
    if (index === -1) return null;

    this.requests[index] = {
      ...this.requests[index],
      assignedToUserId,
      updatedAt: new Date().toISOString(),
    };

    this.notes.unshift({
      id: `srn-${Date.now()}`,
      serviceRequestId: id,
      authorId: meta.changedByUserId || 'system',
      authorRole: meta.changedByRole || 'system',
      text: `Назначен ответственный: ${assignedToUserId || 'не назначен'}`,
      createdAt: new Date().toISOString(),
    });

    return this.hydrate(this.requests[index]);
  }

  async listHistory(serviceRequestId) {
    return this.history.filter((item) => item.serviceRequestId === serviceRequestId);
  }

  async listInternalNotes(serviceRequestId) {
    return this.notes.filter((item) => item.serviceRequestId === serviceRequestId);
  }

  async addInternalNote(serviceRequestId, payload) {
    const note = {
      id: `srn-${Date.now()}`,
      serviceRequestId,
      authorId: payload.authorId,
      authorRole: payload.authorRole,
      text: payload.text,
      createdAt: new Date().toISOString(),
    };

    this.notes.unshift(note);
    return note;
  }

  async analyticsSummary() {
    const byStatus = this.requests.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
    const byCategory = this.requests.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});

    return {
      totals: {
        requests: this.requests.length,
        open: this.requests.filter((item) => item.status !== 'closed').length,
        closed: this.requests.filter((item) => item.status === 'closed').length,
      },
      byStatus,
      byCategory,
      kpi: {
        activeServiceEngineers: 1,
        activeSalesManagers: 1,
        avgResolutionHours: 18,
      },
      heatmap: [
        { day: 'Mon', hour: 10, value: 4 },
        { day: 'Tue', hour: 12, value: 3 },
      ],
    };
  }
}
