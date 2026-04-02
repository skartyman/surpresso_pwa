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

export class InMemoryUserRepository {
  constructor() {
    this.users = [...seed.users];
  }

  async findByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    return this.users.find((user) => user.email.toLowerCase() === normalized) || null;
  }

  async findById(id) {
    return this.users.find((user) => user.id === id) || null;
  }
}

export class InMemoryClientRepository {
  constructor() {
    this.clients = [...seed.clients];
  }

  async findByTelegramUserId(telegramUserId) {
    return this.clients.find((client) => client.telegramUserId === String(telegramUserId)) || null;
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
  }

  async listByClientId(clientId) {
    return this.requests.filter((item) => item.clientId === clientId).map(withRequestCompatibility);
  }

  async findById(id) {
    return withRequestCompatibility(this.requests.find((item) => item.id === id) || null);
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
    return withRequestCompatibility(next);
  }

  async updateStatus(id, status) {
    const index = this.requests.findIndex((item) => item.id === id);
    if (index === -1) {
      return null;
    }

    this.requests[index] = {
      ...this.requests[index],
      status,
      updatedAt: new Date().toISOString(),
    };

    return withRequestCompatibility(this.requests[index]);
  }
}
