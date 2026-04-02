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

  async listForAdmin({ status, id, client, equipment } = {}) {
    const clientSearch = String(client || '').toLowerCase();
    const equipmentSearch = String(equipment || '').toLowerCase();
    return this.requests
      .filter((item) => !status || item.status === status)
      .filter((item) => !id || item.id.toLowerCase().includes(id.toLowerCase()))
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
}
