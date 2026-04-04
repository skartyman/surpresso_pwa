import { seed } from '../seed/mockData.js';
import { REQUEST_TYPES, resolveDepartmentByType } from '../../domain/entities/requestTypes.js';

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
    type: item.type || REQUEST_TYPES.serviceRepair,
    title: item.title || item.description || '',
    assignedDepartment: item.assignedDepartment || resolveDepartmentByType(item.type || REQUEST_TYPES.serviceRepair),
    canOperate: item.canOperateNow,
  };
}

export class InMemoryUserRepository {
  constructor() {
    this.users = [...seed.users];
  }

  normalizeUser(user) {
    if (!user) return null;
    return {
      ...user,
      fullName: user.fullName || user.name || '',
      phone: user.phone || '',
      positionTitle: user.positionTitle || '',
    };
  }

  async findByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    return this.normalizeUser(this.users.find((user) => user.email.toLowerCase() === normalized) || null);
  }

  async findById(id) {
    return this.normalizeUser(this.users.find((user) => user.id === id) || null);
  }

  async listForAdmin({ q, role, isActive } = {}) {
    const search = String(q || '').trim().toLowerCase();
    return this.users
      .filter((user) => !role || user.role === role)
      .filter((user) => isActive === null || isActive === undefined || user.isActive === isActive)
      .filter((user) => {
        if (!search) return true;
        const haystack = `${user.fullName || user.name || ''} ${user.email || ''} ${user.phone || ''} ${user.positionTitle || ''}`.toLowerCase();
        return haystack.includes(search);
      })
      .map((user) => this.normalizeUser(user));
  }

  async create(payload) {
    const now = new Date().toISOString();
    const user = {
      id: payload.id || `user-${Date.now()}`,
      fullName: payload.fullName,
      email: payload.email,
      phone: payload.phone || '',
      passwordHash: payload.passwordHash,
      role: payload.role,
      positionTitle: payload.positionTitle || '',
      isActive: payload.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.users.unshift(user);
    return this.normalizeUser(user);
  }

  async updateById(id, patch) {
    const index = this.users.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const updated = {
      ...this.users[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.users[index] = updated;
    return this.normalizeUser(updated);
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
    this.assignmentHistory = [...(seed.serviceRequestAssignmentHistory || [])];
    this.users = [...seed.users];
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
      assignedToUser: this.users.find((entry) => entry.id === request.assignedToUserId) || null,
      assignedByUser: this.users.find((entry) => entry.id === request.assignedByUserId) || null,
      assignmentHistory: this.assignmentHistory
        .filter((item) => item.serviceRequestId === request.id)
        .map((item) => ({
          ...item,
          fromUser: this.users.find((entry) => entry.id === item.fromUserId) || null,
          toUser: this.users.find((entry) => entry.id === item.toUserId) || null,
          assignedByUser: this.users.find((entry) => entry.id === item.assignedByUserId) || null,
        })),
    };
  }

  async listByClientId(clientId) {
    return this.requests.filter((item) => item.clientId === clientId).map((item) => this.hydrate(item));
  }

  sortRequests(items, sort) {
    if (sort === 'updatedAt') return [...items].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    if (sort === 'urgency') {
      const priority = { critical: 4, high: 3, medium: 2, low: 1 };
      return [...items].sort((a, b) => (priority[b.urgency] || 0) - (priority[a.urgency] || 0));
    }
    return [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async listForAdmin({ status, id, client, equipment, type, assignedDepartment, assignedToUserId, sort = 'createdAt' } = {}) {
    const clientSearch = String(client || '').toLowerCase();
    const equipmentSearch = String(equipment || '').toLowerCase();
    const list = this.requests
      .filter((item) => !status || item.status === status)
      .filter((item) => !type || (item.type || REQUEST_TYPES.serviceRepair) === type)
      .filter((item) => !assignedDepartment || (item.assignedDepartment || resolveDepartmentByType(item.type || REQUEST_TYPES.serviceRepair)) === assignedDepartment)
      .filter((item) => !assignedToUserId || item.assignedToUserId === assignedToUserId)
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
    return this.sortRequests(list, sort);
  }

  isOverdue(item, now = new Date()) {
    if (!item || item.status === 'closed' || item.status === 'resolved') return false;
    const slaHours = { critical: 4, high: 8, medium: 24, low: 48 };
    const hours = slaHours[item.urgency] || 24;
    return (now.getTime() - new Date(item.createdAt).getTime()) > hours * 3600000;
  }

  async getDashboardMetrics(filters = {}) {
    const requests = await this.listForAdmin(filters);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const serviceEngineers = this.users.filter((item) => item.role === 'service_engineer' && item.isActive);
    const noteByRequest = this.notes.reduce((acc, note) => {
      (acc[note.serviceRequestId] ||= []).push(note);
      return acc;
    }, {});

    const attention = {
      unassigned: requests.filter((item) => !item.assignedToUserId).length,
      critical: requests.filter((item) => item.urgency === 'critical').length,
      withoutEquipment: requests.filter((item) => !item.equipmentId).length,
      withoutResponse: requests.filter((item) => !this.history.some((h) => h.serviceRequestId === item.id)).length,
      stuckInProgress: requests.filter((item) => item.status === 'in_progress' && (now.getTime() - new Date(item.updatedAt).getTime()) > 48 * 3600000).length,
      overdue: requests.filter((item) => this.isOverdue(item, now)).length,
    };

    const statusCount = requests.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

    const waitingParts = requests.filter((item) => (noteByRequest[item.id] || []).some((n) => String(n.text || '').toLowerCase().includes('waiting_parts') || String(n.text || '').toLowerCase().includes('запчаст'))).length;
    const closedToday = requests.filter((item) => item.status === 'closed' && String(item.updatedAt).slice(0, 10) === today).length;

    const engineerLoad = serviceEngineers.map((eng) => {
      const own = requests.filter((item) => item.assignedToUserId === eng.id);
      const closed = own.filter((item) => item.status === 'closed');
      return {
        userId: eng.id,
        name: eng.fullName || eng.name,
        active: own.filter((item) => item.status !== 'closed').length,
        overdue: own.filter((item) => this.isOverdue(item, now)).length,
        closedToday: own.filter((item) => item.status === 'closed' && String(item.updatedAt).slice(0, 10) === today).length,
        avgCloseHours: closed.length ? closed.reduce((sum, item) => sum + ((new Date(item.updatedAt) - new Date(item.createdAt)) / 3600000), 0) / closed.length : null,
      };
    });

    const grouped = (list, keyFn) => Object.entries(list.reduce((acc, item) => {
      const key = keyFn(item) || '—';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})).map(([key, value]) => ({ key, label: key, value })).sort((a, b) => b.value - a.value).slice(0, 8);

    const daily = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setUTCDate(now.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      daily.push({ key: iso, label: iso.slice(5), value: requests.filter((item) => String(item.createdAt).slice(0, 10) === iso).length });
    }

    return {
      kpis: [
        { key: 'new', label: 'Новые заявки', value: statusCount.new || 0 },
        { key: 'in_progress', label: 'В работе', value: statusCount.in_progress || 0 },
        { key: 'overdue', label: 'Просроченные', value: attention.overdue },
        { key: 'unassigned', label: 'Без назначения', value: attention.unassigned },
        { key: 'waiting_parts', label: 'Ждут запчасти', value: waitingParts },
        { key: 'closed_today', label: 'Закрыто сегодня', value: closedToday },
      ],
      attention: [
        { key: 'unassigned', label: 'Без назначения', value: attention.unassigned },
        { key: 'critical', label: 'Критические', value: attention.critical },
        { key: 'without_equipment', label: 'Без оборудования', value: attention.withoutEquipment },
        { key: 'without_response', label: 'Без ответа', value: attention.withoutResponse },
        { key: 'stuck', label: 'Зависшие в работе', value: attention.stuckInProgress },
        { key: 'overdue', label: 'Просроченные', value: attention.overdue },
      ],
      engineers: serviceEngineers.map((item) => ({ userId: item.id, name: item.fullName || item.name })),
      engineerLoad,
      analytics: {
        statuses: grouped(requests, (item) => item.status),
        equipmentTypes: grouped(requests.filter((item) => item.equipment), (item) => item.equipment.type),
        brands: grouped(requests.filter((item) => item.equipment), (item) => item.equipment.brand),
        daily,
      },
    };
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
      id: payload.id || `req-${Date.now()}`,
      type: payload.type || REQUEST_TYPES.serviceRepair,
      title: payload.title || payload.description || 'Новое обращение',
      assignedDepartment: payload.assignedDepartment || resolveDepartmentByType(payload.type || REQUEST_TYPES.serviceRepair),
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

  async assignToUser(id, assignedToUserId, meta = {}) {
    const index = this.requests.findIndex((item) => item.id === id);
    if (index === -1) {
      return null;
    }
    const fromUserId = this.requests[index].assignedToUserId || null;
    this.requests[index] = {
      ...this.requests[index],
      assignedToUserId: assignedToUserId || null,
      assignedAt: assignedToUserId ? new Date().toISOString() : null,
      assignedByUserId: assignedToUserId ? (meta.assignedByUserId || null) : null,
      updatedAt: new Date().toISOString(),
    };
    if (assignedToUserId) {
      this.assignmentHistory.unshift({
        id: `srah-${Date.now()}`,
        serviceRequestId: id,
        fromUserId,
        toUserId: assignedToUserId,
        assignedByUserId: meta.assignedByUserId,
        comment: meta.comment || null,
        createdAt: new Date().toISOString(),
      });
    }
    return this.hydrate(this.requests[index]);
  }

  async listServiceEngineers() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    return this.users
      .filter((item) => item.role === 'service_engineer')
      .map((engineer) => {
        const own = this.requests.filter((item) => item.assignedToUserId === engineer.id);
        return {
          id: engineer.id,
          fullName: engineer.fullName || engineer.name,
          role: engineer.role,
          isActive: engineer.isActive,
          workload: {
            activeCount: own.filter((item) => item.status !== 'closed' && item.status !== 'resolved').length,
            overdueCount: own.filter((item) => this.isOverdue(item, now)).length,
            criticalCount: own.filter((item) => item.urgency === 'critical' && item.status !== 'closed' && item.status !== 'resolved').length,
            resolvedTodayCount: own.filter((item) => (item.status === 'resolved' || item.status === 'closed') && String(item.updatedAt).slice(0, 10) === today).length,
          },
        };
      });
  }

  async listHistory(serviceRequestId) {
    return this.history.filter((item) => item.serviceRequestId === serviceRequestId);
  }

  async listAssignmentHistory(serviceRequestId) {
    return this.assignmentHistory
      .filter((item) => item.serviceRequestId === serviceRequestId)
      .map((item) => ({
        ...item,
        fromUser: this.users.find((entry) => entry.id === item.fromUserId) || null,
        toUser: this.users.find((entry) => entry.id === item.toUserId) || null,
        assignedByUser: this.users.find((entry) => entry.id === item.assignedByUserId) || null,
      }));
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
