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
    this.clients = [...seed.clients];
    this.equipment = [...seed.equipment];
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

  async listForAdmin({ status } = {}) {
    return this.requests
      .filter((item) => !status || item.status === status)
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

    return this.hydrate(this.requests[index]);
  }
}
