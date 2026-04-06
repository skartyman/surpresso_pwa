import { isServiceRequestClosed } from '../../domain/workflow/serviceRequestStatuses.js';

function mapClient(client) {
  if (!client) return null;
  return {
    ...client,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
  };
}

function mapNetwork(item) {
  if (!item) return null;
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() || item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() || item.updatedAt,
  };
}

function mapLocation(item) {
  if (!item) return null;
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() || item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() || item.updatedAt,
    network: mapNetwork(item.network),
  };
}

function mapPointUser(item) {
  if (!item) return null;
  return {
    ...item,
    createdAt: item.createdAt?.toISOString?.() || item.createdAt,
    updatedAt: item.updatedAt?.toISOString?.() || item.updatedAt,
    client: mapClient(item.client),
    network: mapNetwork(item.network),
    location: mapLocation(item.location),
  };
}

function mapEquipment(item) {
  if (!item) return null;
  return {
    ...item,
    serialNumber: item.serial,
    locationName: item.location?.name || null,
    address: item.location?.address || item.clientLocation || null,
    networkName: item.network?.name || null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function mapServiceRequest(item) {
  if (!item) return null;
  return {
    ...item,
    type: item.type || 'service_repair',
    title: item.title || item.description || '',
    assignedDepartment: item.assignedDepartment || 'service',
    assignedAt: item.assignedAt ? item.assignedAt.toISOString() : null,
    canOperate: item.canOperateNow,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    client: mapClient(item.client),
    pointUser: mapPointUser(item.pointUser),
    location: mapLocation(item.location),
    equipment: mapEquipment(item.equipment),
    assignedToUser: mapUser(item.assignedToUser),
    assignedByUser: mapUser(item.assignedByUser),
    media: (item.media || []).map((media) => ({
      ...media,
      createdAt: media.createdAt.toISOString(),
      fileUrl: media.fileUrl || '',
      previewUrl: media.previewUrl || '',
      imgUrl: media.previewUrl || '',
      url: media.fileUrl || '',
      size: Number(media.size || 0),
    })),
    history: (item.history || []).map((historyItem) => ({
      ...historyItem,
      createdAt: historyItem.createdAt.toISOString(),
    })),
    notes: (item.notes || []).map((note) => ({
      ...note,
      createdAt: note.createdAt.toISOString(),
    })),
    assignmentHistory: (item.assignmentHistory || []).map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      fromUser: mapUser(row.fromUser),
      toUser: mapUser(row.toUser),
      assignedByUser: mapUser(row.assignedByUser),
    })),
  };
}

function mapUser(user) {
  if (!user) return null;
  return {
    ...user,
    fullName: user.fullName || user.name || '',
    phone: user.phone || '',
    notes: user.notes || '',
    positionTitle: user.positionTitle || '',
    specializations: (user.specializations || []).map((item) => item.specializationKey),
    brands: (user.brandSkills || []).map((item) => item.brandKey),
    zones: (user.zones || []).map((item) => item.zoneKey),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export class NeonUserRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  buildWhere({ q, role, isActive, roles } = {}) {
    return {
      ...(role ? { role } : {}),
      ...(Array.isArray(roles) && roles.length ? { role: { in: roles } } : {}),
      ...(isActive === null || isActive === undefined ? {} : { isActive: Boolean(isActive) }),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
              { positionTitle: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  userInclude() {
    return {
      specializations: true,
      brandSkills: true,
      zones: true,
    };
  }

  async findByEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalized }, include: this.userInclude() });
    return mapUser(user);
  }

  async findById(id) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: this.userInclude() });
    return mapUser(user);
  }

  async listForAdmin(filters = {}) {
    return this.listUsers(filters);
  }

  async listUsers({ q, role, roles, isActive } = {}) {
    const where = this.buildWhere({ q, role, roles, isActive });
    const users = await this.prisma.user.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: this.userInclude(),
      orderBy: { createdAt: 'desc' },
    });
    return users.map(mapUser);
  }

  async getUserById(id) {
    return this.findById(id);
  }

  async listServiceEngineers({ q, isActive } = {}) {
    return this.listUsers({ q, isActive, roles: ['service_engineer', 'service_head'] });
  }

  async create(payload) {
    const userId = payload.id || `user-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const user = await this.prisma.user.create({
      data: {
        id: userId,
        fullName: payload.fullName,
        email: payload.email,
        phone: payload.phone || null,
        notes: payload.notes || null,
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
      },
      include: this.userInclude(),
    });

    await this.updateUserRelations(userId, payload);
    return this.findById(userId);
  }

  async updateById(id, patch) {
    return this.updateUser(id, patch);
  }

  async updateUser(id, patch) {
    const relationPayload = {
      specializations: patch.specializations,
      brands: patch.brands,
      zones: patch.zones,
    };

    const nextPatch = {
      ...patch,
      ...(patch.phone !== undefined ? { phone: patch.phone || null } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes || null } : {}),
    };
    delete nextPatch.specializations;
    delete nextPatch.brands;
    delete nextPatch.zones;

    if (Object.keys(nextPatch).length) {
      await this.prisma.user.update({ where: { id }, data: nextPatch });
    }

    await this.updateUserRelations(id, relationPayload);
    return this.findById(id);
  }

  async setUserSpecializations(userId, specializations = []) {
    await this.prisma.$transaction([
      this.prisma.userSpecialization.deleteMany({ where: { userId } }),
      ...(specializations.length
        ? [
            this.prisma.userSpecialization.createMany({
              data: specializations.map((specializationKey, index) => ({
                id: `uspec-${userId}-${index}-${Date.now()}`,
                userId,
                specializationKey,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }

  async setUserBrands(userId, brands = []) {
    await this.prisma.$transaction([
      this.prisma.userBrandSkill.deleteMany({ where: { userId } }),
      ...(brands.length
        ? [
            this.prisma.userBrandSkill.createMany({
              data: brands.map((brandKey, index) => ({
                id: `ubrand-${userId}-${index}-${Date.now()}`,
                userId,
                brandKey,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }

  async setUserZones(userId, zones = []) {
    await this.prisma.$transaction([
      this.prisma.userZone.deleteMany({ where: { userId } }),
      ...(zones.length
        ? [
            this.prisma.userZone.createMany({
              data: zones.map((zoneKey, index) => ({
                id: `uzone-${userId}-${index}-${Date.now()}`,
                userId,
                zoneKey,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
  }

  async updateUserRelations(userId, payload = {}) {
    const jobs = [];
    if (payload.specializations !== undefined) jobs.push(this.setUserSpecializations(userId, payload.specializations));
    if (payload.brands !== undefined) jobs.push(this.setUserBrands(userId, payload.brands));
    if (payload.zones !== undefined) jobs.push(this.setUserZones(userId, payload.zones));
    await Promise.all(jobs);
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

  async getMiniAppProfileByTelegramUserId(telegramUserId) {
    const normalized = String(telegramUserId || '').trim();
    const [client, pointUser, networks, locations] = await Promise.all([
      this.findByTelegramUserId(normalized),
      this.prisma.pointUser.findUnique({
        where: { telegramUserId: normalized },
        include: { client: true, network: true, location: { include: { network: true } } },
      }),
      this.prisma.network.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      this.prisma.location.findMany({ where: { isActive: true }, include: { network: true }, orderBy: [{ city: 'asc' }, { name: 'asc' }] }),
    ]);
    return {
      client,
      pointUser: mapPointUser(pointUser),
      network: mapNetwork(pointUser?.network || null),
      location: mapLocation(pointUser?.location || null),
      onboardingComplete: Boolean(pointUser?.networkId && pointUser?.locationId),
      availableNetworks: networks.map(mapNetwork),
      availableLocations: locations.map(mapLocation),
    };
  }

  async registerMiniAppProfile(telegramUser, payload = {}) {
    const telegramUserId = String(telegramUser?.id || '').trim();
    const client = await this.findOrCreateFromTelegramUser(telegramUser, {
      contactName: payload.contactName || payload.fullName || `Telegram user ${telegramUserId}`,
      companyName: payload.companyName || 'Telegram client',
      phone: payload.phone || '',
      isActive: true,
    });

    await this.prisma.client.update({
      where: { id: client.id },
      data: {
        ...(payload.contactName !== undefined || payload.fullName !== undefined ? { contactName: payload.contactName || payload.fullName || client.contactName } : {}),
        ...(payload.phone !== undefined ? { phone: payload.phone || '' } : {}),
        ...(payload.companyName !== undefined ? { companyName: payload.companyName || client.companyName } : {}),
      },
    });

    await this.prisma.pointUser.upsert({
      where: { telegramUserId },
      update: {
        clientId: client.id,
        networkId: payload.networkId || null,
        locationId: payload.locationId || null,
        role: payload.role || 'barista',
        fullName: payload.fullName || payload.contactName || client.contactName || null,
        phone: payload.phone || client.phone || null,
        isActive: true,
      },
      create: {
        id: `point-user-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        telegramUserId,
        clientId: client.id,
        networkId: payload.networkId || null,
        locationId: payload.locationId || null,
        role: payload.role || 'barista',
        fullName: payload.fullName || payload.contactName || client.contactName || null,
        phone: payload.phone || client.phone || null,
        isActive: true,
      },
    });

    return this.getMiniAppProfileByTelegramUserId(telegramUserId);
  }
}

export class NeonEquipmentRepository {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async listByClientId(clientId) {
    const items = await this.prisma.equipment.findMany({
      where: { clientId },
      include: { location: true, network: true },
      orderBy: { createdAt: 'desc' },
    });
    return items.map(mapEquipment);
  }

  async listByMiniAppScope({ clientId, locationId } = {}) {
    const items = await this.prisma.equipment.findMany({
      where: {
        clientId,
        ...(locationId ? { locationId } : {}),
      },
      include: { location: true, network: true },
      orderBy: { createdAt: 'desc' },
    });
    return items.map(mapEquipment);
  }

  async findById(id) {
    const item = await this.prisma.equipment.findUnique({ where: { id }, include: { location: true, network: true } });
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
      include: { media: true, client: true, pointUser: { include: { network: true, location: { include: { network: true } }, client: true } }, location: { include: { network: true } }, equipment: { include: { location: true, network: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return items.map(mapServiceRequest);
  }

  async listByMiniAppScope({ clientId, pointUserId, locationId } = {}) {
    const items = await this.prisma.serviceRequest.findMany({
      where: {
        clientId,
        ...(locationId ? { OR: [{ locationId }, { equipment: { locationId } }] } : {}),
        ...(!locationId && pointUserId ? { OR: [{ pointUserId: null }, { pointUserId }] } : {}),
      },
      include: {
        media: true,
        client: true,
        pointUser: { include: { network: true, location: { include: { network: true } }, client: true } },
        location: { include: { network: true } },
        equipment: { include: { location: true, network: true } },
        assignedToUser: true,
        assignedByUser: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return items.map(mapServiceRequest);
  }

  async findById(id) {
    const item = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        media: true,
        client: true,
        pointUser: { include: { network: true, location: { include: { network: true } }, client: true } },
        location: { include: { network: true } },
        equipment: { include: { location: true, network: true } },
        assignedToUser: true,
        assignedByUser: true,
      },
    });
    return mapServiceRequest(item);
  }

  async findByIdForMiniAppScope(id, { clientId, pointUserId, locationId } = {}) {
    const item = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        media: true,
        client: true,
        pointUser: { include: { network: true, location: { include: { network: true } }, client: true } },
        location: { include: { network: true } },
        equipment: { include: { location: true, network: true } },
        assignedToUser: true,
        assignedByUser: true,
      },
    });
    const mapped = mapServiceRequest(item);
    if (!mapped || mapped.clientId !== clientId) return null;
    const requestLocationId = mapped.locationId || mapped.equipment?.locationId || null;
    if (locationId && requestLocationId !== locationId) return null;
    if (!locationId && pointUserId && mapped.pointUserId && mapped.pointUserId !== pointUserId) return null;
    return mapped;
  }

  buildAdminWhere({ status, id, client, equipment, type, assignedDepartment, assignedToUserId } = {}) {
    return {
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(assignedDepartment ? { assignedDepartment } : {}),
      ...(assignedToUserId ? { assignedToUserId } : {}),
      ...(id ? { id: { contains: id, mode: 'insensitive' } } : {}),
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
  }

  sortRequests(items, sort) {
    if (sort === 'updatedAt') return [...items].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    if (sort === 'urgency') {
      const priority = { critical: 4, high: 3, medium: 2, low: 1 };
      return [...items].sort((a, b) => (priority[b.urgency] || 0) - (priority[a.urgency] || 0));
    }
    return [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async listForAdmin(filters = {}) {
    const { sort = 'createdAt' } = filters;
    const where = this.buildAdminWhere(filters);
    const items = await this.prisma.serviceRequest.findMany({
      where: Object.keys(where).length ? where : undefined,
      include: { media: true, client: true, equipment: true, assignedToUser: true, assignedByUser: true },
      orderBy: { createdAt: 'desc' },
    });
    return this.sortRequests(items.map(mapServiceRequest), sort);
  }

  isOverdue(item, now = new Date()) {
    if (!item || isServiceRequestClosed(item.status)) return false;
    const slaHours = { critical: 4, high: 8, medium: 24, low: 48 };
    const hours = slaHours[item.urgency] || 24;
    const createdAt = new Date(item.createdAt).getTime();
    return now.getTime() - createdAt > hours * 60 * 60 * 1000;
  }

  async getDashboardMetrics(filters = {}) {
    const requests = await this.listForAdmin(filters);
    const requestIds = requests.map((item) => item.id);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const history = requestIds.length
      ? await this.prisma.serviceRequestStatusHistory.findMany({ where: { serviceRequestId: { in: requestIds } } })
      : [];
    const notes = requestIds.length
      ? await this.prisma.serviceRequestInternalNote.findMany({ where: { serviceRequestId: { in: requestIds } } })
      : [];
    const engineers = await this.prisma.user.findMany({ where: { role: 'service_engineer', isActive: true }, orderBy: { fullName: 'asc' } });

    const byId = Object.fromEntries(requests.map((r) => [r.id, r]));
    const notesByRequest = notes.reduce((acc, item) => {
      (acc[item.serviceRequestId] ||= []).push(item);
      return acc;
    }, {});

    const statusCounts = requests.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

    const attention = {
      unassigned: requests.filter((item) => !item.assignedToUserId).length,
      critical: requests.filter((item) => item.urgency === 'critical').length,
      withoutEquipment: requests.filter((item) => !item.equipmentId).length,
      withoutResponse: requests.filter((item) => !history.some((h) => h.serviceRequestId === item.id)).length,
      stuckInProgress: requests.filter((item) => item.status === 'taken_in_work' && (now.getTime() - new Date(item.updatedAt).getTime()) > 48 * 60 * 60 * 1000).length,
      overdue: requests.filter((item) => this.isOverdue(item, now)).length,
    };

    const closedToday = requests.filter((item) => isServiceRequestClosed(item.status) && String(item.updatedAt).slice(0, 10) === today).length;
    const waitingParts = requests.filter((item) => (notesByRequest[item.id] || []).some((n) => String(n.text || '').toLowerCase().includes('waiting_parts') || String(n.text || '').toLowerCase().includes('запчаст'))).length;

    const engineerLoad = engineers.map((eng) => {
      const own = requests.filter((item) => item.assignedToUserId === eng.id);
      const closed = own.filter((item) => isServiceRequestClosed(item.status));
      const avgCloseHours = closed.length
        ? closed.reduce((sum, item) => sum + ((new Date(item.updatedAt).getTime() - new Date(item.createdAt).getTime()) / 3600000), 0) / closed.length
        : null;
      return {
        userId: eng.id,
        name: eng.fullName,
        active: own.filter((item) => !isServiceRequestClosed(item.status)).length,
        overdue: own.filter((item) => this.isOverdue(item, now)).length,
        closedToday: own.filter((item) => isServiceRequestClosed(item.status) && String(item.updatedAt).slice(0, 10) === today).length,
        avgCloseHours,
      };
    });

    const daily = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setUTCDate(now.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      daily.push({ key: iso, label: iso.slice(5), value: requests.filter((item) => String(item.createdAt).slice(0, 10) === iso).length });
    }

    const grouped = (items, keyFn, labelFn = (v) => v || '—') => Object.entries(items.reduce((acc, item) => {
      const key = keyFn(item) || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})).map(([key, value]) => ({ key, label: labelFn(key), value })).sort((a, b) => b.value - a.value).slice(0, 8);

    return {
      kpis: [
        { key: 'new', label: 'Новые заявки', value: statusCounts.new || 0 },
        { key: 'taken_in_work', label: 'В работе', value: statusCounts.taken_in_work || 0 },
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
      engineers: engineers.map((eng) => ({ userId: eng.id, name: eng.fullName })),
      engineerLoad,
      assignment: {
        unassignedCount: attention.unassigned,
        overloadedEngineers: engineerLoad.filter((item) => item.active + item.overdue >= 6).map((item) => ({ userId: item.userId, name: item.name })),
        freeEngineers: engineerLoad.filter((item) => item.active === 0 && item.overdue === 0).map((item) => ({ userId: item.userId, name: item.name })),
      },
      analytics: {
        statuses: grouped(requests, (item) => item.status, (key) => key),
        equipmentTypes: grouped(requests.filter((item) => item.equipment), (item) => item.equipment.type, (key) => key),
        brands: grouped(requests.filter((item) => item.equipment), (item) => item.equipment.brand, (key) => key),
        daily,
      },
      byId,
    };
  }

  async findForAdminById(id) {
    const item = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        media: true,
        client: true,
        equipment: true,
        assignedToUser: true,
        assignedByUser: true,
        history: { orderBy: { createdAt: 'desc' } },
        notes: { orderBy: { createdAt: 'desc' } },
        assignmentHistory: {
          orderBy: { createdAt: 'desc' },
          include: {
            fromUser: true,
            toUser: true,
            assignedByUser: true,
          },
        },
      },
    });
    return mapServiceRequest(item);
  }

  async create(payload) {
    const created = await this.prisma.serviceRequest.create({
      data: {
        id: payload.id || `req-${Date.now()}`,
        type: payload.type || 'service_repair',
        title: payload.title || payload.description || 'Новое обращение',
        clientId: payload.clientId,
        pointUserId: payload.pointUserId || null,
        locationId: payload.locationId || null,
        equipmentId: payload.equipmentId,
        assignedDepartment: payload.assignedDepartment || 'service',
        category: payload.category,
        description: payload.description,
        urgency: payload.urgency,
        canOperateNow: Boolean(payload.canOperateNow),
        status: payload.status || 'new',
        source: payload.source || 'telegram_mini_app',
        assignedToUserId: payload.assignedToUserId || null,
        assignedAt: payload.assignedToUserId ? new Date() : null,
        assignedByUserId: payload.assignedByUserId || null,
        media: {
          create: (payload.media || []).map((media) => ({
            id: media.id || `media-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            type: media.type,
            fileId: media.fileId || null,
            fileUrl: media.fileUrl || media.url || '',
            previewUrl: media.previewUrl || media.imgUrl || null,
            mimeType: media.mimeType || null,
            originalName: media.originalName || null,
            size: Number(media.size || 0),
          })),
        },
      },
      include: {
        media: true,
        client: true,
        pointUser: { include: { network: true, location: { include: { network: true } }, client: true } },
        location: { include: { network: true } },
        equipment: { include: { location: true, network: true } },
        assignedToUser: true,
        assignedByUser: true,
      },
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
      include: {
        media: true,
        client: true,
        pointUser: { include: { network: true, location: { include: { network: true } }, client: true } },
        location: { include: { network: true } },
        equipment: { include: { location: true, network: true } },
        assignedToUser: true,
        assignedByUser: true,
      },
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

  async assignToUser(id, assignedToUserId, meta = {}) {
    const existing = await this.prisma.serviceRequest.findUnique({
      where: { id },
      select: { assignedToUserId: true },
    });
    const updated = await this.prisma.serviceRequest.update({
      where: { id },
      data: {
        assignedToUserId: assignedToUserId || null,
        status: assignedToUserId ? 'assigned' : undefined,
        assignedAt: assignedToUserId ? new Date() : null,
        assignedByUserId: assignedToUserId ? (meta.assignedByUserId || null) : null,
      },
      include: { media: true, client: true, equipment: true, assignedToUser: true, assignedByUser: true },
    });

    if (assignedToUserId) {
      await this.prisma.serviceRequestAssignmentHistory.create({
        data: {
          id: `srah-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          serviceRequestId: id,
          fromUserId: existing?.assignedToUserId || null,
          toUserId: assignedToUserId,
          assignedByUserId: meta.assignedByUserId,
          comment: meta.comment || null,
        },
      });
    }
    return mapServiceRequest(updated);
  }
  async listServiceEngineersWithWorkload() {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const engineers = await this.prisma.user.findMany({
      where: { role: 'service_engineer' },
      orderBy: { fullName: 'asc' },
    });
    const requests = await this.prisma.serviceRequest.findMany({
      where: { assignedDepartment: 'service', type: 'service_repair' },
      select: {
        assignedToUserId: true,
        urgency: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return engineers.map((eng) => {
      const own = requests.filter((item) => item.assignedToUserId === eng.id);
      return {
        id: eng.id,
        fullName: eng.fullName,
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
    const items = await this.prisma.serviceRequestStatusHistory.findMany({
      where: { serviceRequestId },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
    }));
  }

  async listAssignmentHistory(serviceRequestId) {
    const items = await this.prisma.serviceRequestAssignmentHistory.findMany({
      where: { serviceRequestId },
      include: { fromUser: true, toUser: true, assignedByUser: true },
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => ({
      id: item.id,
      serviceRequestId: item.serviceRequestId,
      fromUserId: item.fromUserId,
      toUserId: item.toUserId,
      assignedByUserId: item.assignedByUserId,
      comment: item.comment || null,
      createdAt: item.createdAt.toISOString(),
      fromUser: mapUser(item.fromUser),
      toUser: mapUser(item.toUser),
      assignedByUser: mapUser(item.assignedByUser),
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

  async addMedia(serviceRequestId, rows = []) {
    if (!rows.length) {
      return this.findForAdminById(serviceRequestId);
    }

    await this.prisma.serviceRequestMedia.createMany({
      data: rows.map((row) => ({
        id: row.id || `srm-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        serviceRequestId,
        type: row.type || 'image',
        fileId: row.fileId || null,
        fileUrl: row.fileUrl || row.url || '',
        previewUrl: row.previewUrl || row.imgUrl || null,
        mimeType: row.mimeType || null,
        originalName: row.originalName || null,
        size: Number(row.size || 0),
      })),
    });

    return this.findForAdminById(serviceRequestId);
  }
}
