import { seed } from '../seed/mockData.js';

export class InMemoryUserRepository {
  constructor() {
    this.users = [...seed.users];
  }

  findByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    return this.users.find((user) => user.email.toLowerCase() === normalized) || null;
  }

  findById(id) {
    return this.users.find((user) => user.id === id) || null;
  }
}

export class InMemoryClientRepository {
  constructor() {
    this.clients = [...seed.clients];
  }

  findByTelegramUserId(telegramUserId) {
    return this.clients.find((client) => client.telegramUserId === Number(telegramUserId)) || null;
  }
}

export class InMemoryEquipmentRepository {
  constructor() {
    this.equipment = [...seed.equipment];
  }

  listByClientId(clientId) {
    return this.equipment.filter((item) => item.clientId === clientId);
  }

  findById(id) {
    return this.equipment.find((item) => item.id === id) || null;
  }
}

export class InMemoryServiceRequestRepository {
  constructor() {
    this.requests = [...seed.serviceRequests];
  }

  listByClientId(clientId) {
    return this.requests.filter((item) => item.clientId === clientId);
  }

  findById(id) {
    return this.requests.find((item) => item.id === id) || null;
  }

  create(payload) {
    const next = {
      id: `req-${Date.now()}`,
      status: 'new',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...payload,
    };
    this.requests.unshift(next);
    return next;
  }
}
