import { seed } from '../seed/mockData.js';
import { REQUEST_TYPES, resolveDepartmentByType } from '../../domain/entities/requestTypes.js';
import { isServiceRequestClosed } from '../../domain/workflow/serviceRequestStatuses.js';

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
    assignedAt: item.assignedAt || null,
  };
}

function mapNetwork(item) {
  return item ? { ...item } : null;
}

function mapLocation(item) {
  return item ? { ...item } : null;
}

function mapPointUser(item) {
  return item ? { ...item } : null;
}

export class InMemoryUserRepository {
  constructor() {
    this.users = [...seed.users];
    this.userSpecializations = [...(seed.userSpecializations || [])];
    this.userBrandSkills = [...(seed.userBrandSkills || [])];
    this.userZones = [...(seed.userZones || [])];
  }

  getRelations(userId) {
    return {
      specializations: this.userSpecializations.filter((item) => item.userId === userId).map((item) => item.specializationKey),
      brands: this.userBrandSkills.filter((item) => item.userId === userId).map((item) => item.brandKey),
      zones: this.userZones.filter((item) => item.userId === userId).map((item) => item.zoneKey),
    };
  }

  normalizeUser(user) {
    if (!user) return null;
    return {
      ...user,
      fullName: user.fullName || user.name || '',
      phone: user.phone || '',
      notes: user.notes || '',
      positionTitle: user.positionTitle || '',
      ...this.getRelations(user.id),
    };
  }

  async findByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    return this.normalizeUser(this.users.find((user) => user.email.toLowerCase() === normalized) || null);
  }

  async findById(id) {
    return this.normalizeUser(this.users.find((user) => user.id === id) || null);
  }

  async getUserById(id) {
    return this.findById(id);
  }

  async listForAdmin(filters = {}) {
    return this.listUsers(filters);
  }

  async listUsers({ q, role, roles, isActive } = {}) {
    const search = String(q || '').trim().toLowerCase();
    return this.users
      .filter((user) => !role || user.role === role)
      .filter((user) => !roles?.length || roles.includes(user.role))
      .filter((user) => isActive === null || isActive === undefined || user.isActive === isActive)
      .filter((user) => {
        if (!search) return true;
        const haystack = `${user.fullName || user.name || ''} ${user.email || ''} ${user.phone || ''} ${user.positionTitle || ''}`.toLowerCase();
        return haystack.includes(search);
      })
      .map((user) => this.normalizeUser(user));
  }

  async listServiceEngineers({ q, isActive } = {}) {
    return this.listUsers({ q, isActive, roles: ['service_engineer', 'service_head'] });
  }

  async create(payload) {
    const now = new Date().toISOString();
    const user = {
      id: payload.id || `user-${Date.now()}`,
      fullName: payload.fullName,
      email: payload.email,
      phone: payload.phone || '',
      notes: payload.notes || '',
      workMode: payload.workMode || null,
      capacity: payload.capacity ?? 6,
      maxCritical: payload.maxCritical ?? 2,
      priorityWeight: payload.priorityWeight ?? 0,
      canTakeUrgent: payload.canTakeUrgent ?? true,
      canTakeFieldRequests: payload.canTakeFieldRequests ?? false,
      passwordHash: payload.passwordHash,
      role: payload.role,
      positionTitle: payload.positionTitle || '',
      isActive: payload.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.users.unshift(user);
    await this.updateUserRelations(user.id, payload);
    return this.normalizeUser(user);
  }

  async updateById(id, patch) {
    return this.updateUser(id, patch);
  }

  async updateUser(id, patch) {
    const index = this.users.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const updated = {
      ...this.users[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    delete updated.specializations;
    delete updated.brands;
    delete updated.zones;
    this.users[index] = updated;
    await this.updateUserRelations(id, patch);
    return this.normalizeUser(updated);
  }

  async setUserSpecializations(userId, specializations = []) {
    this.userSpecializations = this.userSpecializations.filter((item) => item.userId !== userId);
    this.userSpecializations.push(
      ...specializations.map((specializationKey, index) => ({ id: `uspec-${Date.now()}-${index}`, userId, specializationKey, createdAt: new Date().toISOString() })),
    );
  }

  async setUserBrands(userId, brands = []) {
    this.userBrandSkills = this.userBrandSkills.filter((item) => item.userId !== userId);
    this.userBrandSkills.push(...brands.map((brandKey, index) => ({ id: `ubrand-${Date.now()}-${index}`, userId, brandKey, createdAt: new Date().toISOString() })));
  }

  async setUserZones(userId, zones = []) {
    this.userZones = this.userZones.filter((item) => item.userId !== userId);
    this.userZones.push(...zones.map((zoneKey, index) => ({ id: `uzone-${Date.now()}-${index}`, userId, zoneKey, createdAt: new Date().toISOString() })));
  }

  async updateUserRelations(userId, payload = {}) {
    if (payload.specializations !== undefined) await this.setUserSpecializations(userId, payload.specializations);
    if (payload.brands !== undefined) await this.setUserBrands(userId, payload.brands);
    if (payload.zones !== undefined) await this.setUserZones(userId, payload.zones);
  }
}

export class InMemoryClientRepository {
  constructor() {
    this.clients = [...seed.clients];
    this.networks = [...(seed.networks || [])];
    this.locations = [...(seed.locations || [])];
    this.pointUsers = [...(seed.pointUsers || [])];
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

  async getMiniAppProfileByTelegramUserId(telegramUserId) {
    const client = await this.findByTelegramUserId(telegramUserId);
    const pointUser = this.pointUsers.find((item) => item.telegramUserId === String(telegramUserId)) || null;
    const network = this.networks.find((item) => item.id === pointUser?.networkId) || null;
    const location = this.locations.find((item) => item.id === pointUser?.locationId) || null;
    return {
      client,
      pointUser: mapPointUser(pointUser),
      network: mapNetwork(network),
      location: mapLocation(location),
      onboardingComplete: Boolean(pointUser?.networkId && pointUser?.locationId),
      availableNetworks: this.networks.filter((item) => item.isActive).map(mapNetwork),
      availableLocations: this.locations.filter((item) => item.isActive).map((item) => ({
        ...mapLocation(item),
        network: mapNetwork(this.networks.find((networkRow) => networkRow.id === item.networkId) || null),
      })),
    };
  }

  async registerMiniAppProfile(telegramUser, payload = {}) {
    const client = await this.findOrCreateFromTelegramUser(telegramUser, {
      contactName: payload.contactName || payload.fullName || `Telegram user ${telegramUser?.id}`,
      companyName: payload.companyName || 'Telegram client',
      phone: payload.phone || '',
      isActive: true,
    });
    const telegramUserId = String(telegramUser?.id || '').trim();
    const existingIndex = this.pointUsers.findIndex((item) => item.telegramUserId === telegramUserId);
    const now = new Date().toISOString();
    const pointUser = {
      id: existingIndex >= 0 ? this.pointUsers[existingIndex].id : `point-user-${Date.now()}`,
      telegramUserId,
      clientId: client.id,
      networkId: payload.networkId || null,
      locationId: payload.locationId || null,
      role: payload.role || 'barista',
      fullName: payload.fullName || payload.contactName || client.contactName || '',
      phone: payload.phone || client.phone || '',
      isActive: true,
      createdAt: existingIndex >= 0 ? this.pointUsers[existingIndex].createdAt : now,
      updatedAt: now,
    };
    if (existingIndex >= 0) this.pointUsers[existingIndex] = pointUser;
    else this.pointUsers.unshift(pointUser);

    const clientIndex = this.clients.findIndex((item) => item.id === client.id);
    if (clientIndex >= 0) {
      this.clients[clientIndex] = {
        ...this.clients[clientIndex],
        contactName: payload.contactName || payload.fullName || this.clients[clientIndex].contactName,
        phone: payload.phone || this.clients[clientIndex].phone,
        companyName: payload.companyName || this.clients[clientIndex].companyName,
        updatedAt: now,
      };
    }

    return this.getMiniAppProfileByTelegramUserId(telegramUserId);
  }
}

export class InMemoryEquipmentRepository {
  constructor() {
    this.equipment = [...seed.equipment];
    this.locations = [...(seed.locations || [])];
    this.networks = [...(seed.networks || [])];
  }

  async listByClientId(clientId) {
    return this.equipment.filter((item) => item.clientId === clientId).map(withEquipmentCompatibility);
  }

  async listByMiniAppScope({ clientId, locationId } = {}) {
    return this.equipment
      .filter((item) => item.clientId === clientId)
      .filter((item) => !locationId || item.locationId === locationId)
      .map((item) => ({
        ...withEquipmentCompatibility(item),
        locationName: this.locations.find((row) => row.id === item.locationId)?.name || null,
        address: this.locations.find((row) => row.id === item.locationId)?.address || item.clientLocation || null,
        networkName: this.networks.find((row) => row.id === item.networkId)?.name || null,
      }));
  }

  async findById(id) {
    const item = this.equipment.find((entry) => entry.id === id) || null;
    if (!item) return null;
    return {
      ...withEquipmentCompatibility(item),
      locationName: this.locations.find((row) => row.id === item.locationId)?.name || null,
      address: this.locations.find((row) => row.id === item.locationId)?.address || item.clientLocation || null,
      networkName: this.networks.find((row) => row.id === item.networkId)?.name || null,
    };
  }
}

export class InMemoryServiceRequestRepository {
  constructor() {
    this.requests = [...seed.serviceRequests];
    this.clients = [...seed.clients];
    this.equipment = [...seed.equipment];
    this.locations = [...(seed.locations || [])];
    this.networks = [...(seed.networks || [])];
    this.pointUsers = [...(seed.pointUsers || [])];
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
    const pointUser = this.pointUsers.find((entry) => entry.id === request.pointUserId) || null;
    const location = this.locations.find((entry) => entry.id === (request.locationId || equipment?.locationId)) || null;
    const assignedToUser = this.users.find((entry) => entry.id === request.assignedToUserId) || null;
    const assignedByUser = this.users.find((entry) => entry.id === request.assignedByUserId) || null;
    const assignmentHistory = this.assignmentHistory
      .filter((entry) => entry.serviceRequestId === request.id)
      .map((entry) => ({
        ...entry,
        fromUser: this.users.find((u) => u.id === entry.fromUserId) || null,
        toUser: this.users.find((u) => u.id === entry.toUserId) || null,
        assignedByUser: this.users.find((u) => u.id === entry.assignedByUserId) || null,
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      ...request,
      client,
      pointUser,
      location,
      equipment: equipment ? {
        ...withEquipmentCompatibility(equipment),
        locationName: location?.name || null,
        address: location?.address || equipment.clientLocation || null,
        networkName: this.networks.find((entry) => entry.id === equipment.networkId)?.name || null,
      } : null,
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

  async listByMiniAppScope({ clientId, pointUserId, locationId } = {}) {
    return this.requests
      .filter((item) => item.clientId === clientId)
      .filter((item) => {
        if (locationId) {
          const equipment = this.equipment.find((entry) => entry.id === item.equipmentId) || null;
          return (item.locationId || equipment?.locationId || null) === locationId;
        }
        if (pointUserId && item.pointUserId) return item.pointUserId === pointUserId;
        return true;
      })
      .map((item) => this.hydrate(item));
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
    if (!item || isServiceRequestClosed(item.status)) return false;
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
      stuckInProgress: requests.filter((item) => item.status === 'taken_in_work' && (now.getTime() - new Date(item.updatedAt).getTime()) > 48 * 3600000).length,
      overdue: requests.filter((item) => this.isOverdue(item, now)).length,
    };

    const statusCount = requests.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

    const waitingParts = requests.filter((item) => (noteByRequest[item.id] || []).some((n) => String(n.text || '').toLowerCase().includes('waiting_parts') || String(n.text || '').toLowerCase().includes('запчаст'))).length;
    const closedToday = requests.filter((item) => isServiceRequestClosed(item.status) && String(item.updatedAt).slice(0, 10) === today).length;

    const engineerLoad = serviceEngineers.map((eng) => {
      const own = requests.filter((item) => item.assignedToUserId === eng.id);
      const closed = own.filter((item) => isServiceRequestClosed(item.status));
      return {
        userId: eng.id,
        name: eng.fullName || eng.name,
        active: own.filter((item) => !isServiceRequestClosed(item.status)).length,
        overdue: own.filter((item) => this.isOverdue(item, now)).length,
        closedToday: own.filter((item) => isServiceRequestClosed(item.status) && String(item.updatedAt).slice(0, 10) === today).length,
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
        { key: 'taken_in_work', label: 'В работе', value: statusCount.taken_in_work || 0 },
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
      assignment: {
        unassignedCount: attention.unassigned,
        overloadedEngineers: engineerLoad.filter((item) => item.active + item.overdue >= 6).map((item) => ({ userId: item.userId, name: item.name })),
        freeEngineers: engineerLoad.filter((item) => item.active === 0 && item.overdue === 0).map((item) => ({ userId: item.userId, name: item.name })),
      },
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

  async findByIdForMiniAppScope(id, { clientId, pointUserId, locationId } = {}) {
    const item = this.requests.find((entry) => entry.id === id) || null;
    if (!item || item.clientId !== clientId) return null;
    if (locationId) {
      const equipment = this.equipment.find((entry) => entry.id === item.equipmentId) || null;
      const requestLocationId = item.locationId || equipment?.locationId || null;
      if (requestLocationId !== locationId) return null;
    } else if (pointUserId && item.pointUserId && item.pointUserId !== pointUserId) {
      return null;
    }
    return this.hydrate(item);
  }

  async findForAdminById(id) {
    return this.findById(id);
  }

  async deleteById(id) {
    const index = this.requests.findIndex((item) => item.id === id);
    if (index === -1) return false;
    this.requests.splice(index, 1);
    this.history = this.history.filter((item) => item.serviceRequestId !== id);
    this.assignmentHistory = this.assignmentHistory.filter((item) => item.serviceRequestId !== id);
    this.notes = this.notes.filter((item) => item.serviceRequestId !== id);
    return true;
  }

  async create(payload) {
    const now = new Date().toISOString();
    const next = {
      id: payload.id || `req-${Date.now()}`,
      type: payload.type || REQUEST_TYPES.serviceRepair,
      title: payload.title || payload.description || 'Новое обращение',
      assignedDepartment: payload.assignedDepartment || resolveDepartmentByType(payload.type || REQUEST_TYPES.serviceRepair),
      status: payload.assignedToUserId ? 'assigned' : 'new',
      createdAt: now,
      updatedAt: now,
      pointUserId: payload.pointUserId || null,
      locationId: payload.locationId || null,
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
      status: assignedToUserId ? 'assigned' : this.requests[index].status,
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

  async listAssignmentHistory(serviceRequestId) {
    return this.assignmentHistory
      .filter((item) => item.serviceRequestId === serviceRequestId)
      .map((item) => ({
        ...item,
        fromUser: this.users.find((u) => u.id === item.fromUserId) || null,
        toUser: this.users.find((u) => u.id === item.toUserId) || null,
        assignedByUser: this.users.find((u) => u.id === item.assignedByUserId) || null,
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async listServiceEngineersWithWorkload() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const engineers = this.users.filter((u) => u.role === 'service_engineer');
    const serviceRequests = this.requests.filter(
      (r) => (r.assignedDepartment || resolveDepartmentByType(r.type || REQUEST_TYPES.serviceRepair)) === 'service'
        && (r.type || REQUEST_TYPES.serviceRepair) === REQUEST_TYPES.serviceRepair,
    );
    return engineers.map((eng) => {
      const own = serviceRequests.filter((item) => item.assignedToUserId === eng.id);
      return {
        id: eng.id,
        fullName: eng.fullName || eng.name || '',
        role: eng.role,
        isActive: eng.isActive,
        workload: {
          activeCount: own.filter((item) => !isServiceRequestClosed(item.status)).length,
          overdueCount: own.filter((item) => this.isOverdue(item, now)).length,
          criticalCount: own.filter((item) => !isServiceRequestClosed(item.status) && item.urgency === 'critical').length,
          resolvedTodayCount: own.filter((item) => isServiceRequestClosed(item.status) && String(item.updatedAt).slice(0, 10) === today).length,
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

  async addMedia(serviceRequestId, rows = []) {
    const index = this.requests.findIndex((item) => item.id === serviceRequestId);
    if (index === -1) return null;
    const current = Array.isArray(this.requests[index].media) ? this.requests[index].media : [];
    this.requests[index] = {
      ...this.requests[index],
      media: [...rows, ...current],
      updatedAt: new Date().toISOString(),
    };
    return this.hydrate(this.requests[index]);
  }
}
