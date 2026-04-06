import { hashPassword } from '../../domain/security/passwordHasher.js';
import {
  SERVICE_BRANDS,
  SERVICE_SPECIALIZATIONS,
  SERVICE_ZONES,
  WORK_MODES,
  normalizeStringList,
} from '../../domain/entities/serviceTeamCatalog.js';
import { isServiceRequestClosed } from '../../domain/workflow/serviceRequestStatuses.js';

const ALLOWED_ROLES = ['manager', 'service_engineer', 'service_head', 'sales_manager', 'owner', 'director', 'seo'];
const SERVICE_TEAM_VIEW_ROLES = ['owner', 'director', 'service_head', 'manager', 'service_engineer', 'sales_manager', 'seo'];
const SERVICE_TEAM_EDIT_ROLES = ['owner', 'director', 'service_head', 'manager'];

function canManageRole(adminRole, targetRole) {
  if (!targetRole) return false;
  return SERVICE_TEAM_EDIT_ROLES.includes(adminRole) && ALLOWED_ROLES.includes(targetRole);
}

function canManageUser(adminUser, targetUser) {
  if (!adminUser || !targetUser) return false;
  if (SERVICE_TEAM_EDIT_ROLES.includes(adminUser.role)) return true;
  return adminUser.role === 'service_engineer' && adminUser.id === targetUser.id;
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return ALLOWED_ROLES.includes(role) ? role : null;
}

function normalizeWorkMode(value) {
  if (value === null || value === undefined || value === '') return null;
  const mode = String(value).trim();
  return WORK_MODES.includes(mode) ? mode : null;
}

function toDateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function isOverdue(item, now = new Date()) {
  if (!item || isServiceRequestClosed(item.status)) return false;
  const slaHours = { critical: 4, high: 8, medium: 24, normal: 24, low: 48 };
  const limit = (slaHours[item.urgency] || 24) * 60 * 60 * 1000;
  return now.getTime() - new Date(item.createdAt).getTime() > limit;
}

function mapWorkloadMetrics(requests = []) {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const activeStatuses = new Set(['new', 'assigned', 'taken_in_work', 'ready_for_qc', 'on_service_head_control', 'to_director', 'invoiced']);
  return {
    activeCount: requests.filter((item) => activeStatuses.has(item.status)).length,
    overdueCount: requests.filter((item) => isOverdue(item, now)).length,
    criticalCount: requests.filter((item) => item.urgency === 'critical' && !isServiceRequestClosed(item.status)).length,
    resolvedTodayCount: requests.filter((item) => isServiceRequestClosed(item.status) && toDateKey(item.updatedAt) === today).length,
  };
}

function normalizePayload(body = {}) {
  const payload = {
    fullName: body.fullName !== undefined ? String(body.fullName || '').trim() : undefined,
    email: body.email !== undefined ? String(body.email || '').trim().toLowerCase() : undefined,
    phone: body.phone !== undefined ? String(body.phone || '').trim() : undefined,
    notes: body.notes !== undefined ? String(body.notes || '').trim() : undefined,
    positionTitle: body.positionTitle !== undefined ? String(body.positionTitle || '').trim() : undefined,
    role: body.role !== undefined ? normalizeRole(body.role) : undefined,
    workMode: body.workMode !== undefined ? normalizeWorkMode(body.workMode) : undefined,
    isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
    capacity: body.capacity !== undefined ? Number(body.capacity) : undefined,
    maxCritical: body.maxCritical !== undefined ? Number(body.maxCritical) : undefined,
    priorityWeight: body.priorityWeight !== undefined ? Number(body.priorityWeight) : undefined,
    canTakeUrgent: body.canTakeUrgent !== undefined ? Boolean(body.canTakeUrgent) : undefined,
    canTakeFieldRequests: body.canTakeFieldRequests !== undefined ? Boolean(body.canTakeFieldRequests) : undefined,
    specializations: body.specializations !== undefined ? normalizeStringList(body.specializations) : undefined,
    brands: body.brands !== undefined ? normalizeStringList(body.brands) : undefined,
    zones: body.zones !== undefined ? normalizeStringList(body.zones) : undefined,
  };

  if (body.password !== undefined) {
    payload.password = String(body.password || '');
  }

  if (payload.specializations) {
    payload.specializations = payload.specializations.filter((key) => SERVICE_SPECIALIZATIONS.includes(key));
  }
  if (payload.brands) {
    payload.brands = payload.brands.filter((key) => /^[a-zA-Z0-9-]+$/.test(key));
  }
  if (payload.zones) {
    payload.zones = payload.zones.filter((key) => /^[a-zA-Z0-9-]+$/.test(key));
  }

  return payload;
}

export function createAdminEmployeeController(userRepository, serviceRepository) {
  async function enrichWithWorkload(user) {
    const requests = await serviceRepository.listForAdmin({ assignedToUserId: user.id });
    const metrics = mapWorkloadMetrics(requests);
    return { ...user, workload: metrics, ...metrics };
  }

  return {
    async list(req, res) {
      if (!SERVICE_TEAM_VIEW_ROLES.includes(req.adminUser?.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const q = String(req.query?.q || '').trim();
      const role = normalizeRole(req.query?.role);
      const isActiveRaw = req.query?.isActive;
      const isActive = isActiveRaw === undefined || isActiveRaw === '' ? null : String(isActiveRaw) === 'true';
      const users = await userRepository.listUsers({ q, role, isActive });
      const enriched = await Promise.all(users.map(enrichWithWorkload));
      return res.json({ users: enriched.map(sanitizeUser) });
    },

    async byId(req, res) {
      const user = await userRepository.getUserById(req.params.id);
      if (!user) {
        return res.status(404).json({ error: 'user_not_found' });
      }
      if (!SERVICE_TEAM_VIEW_ROLES.includes(req.adminUser?.role) && req.adminUser?.id !== user.id) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const enriched = await enrichWithWorkload(user);
      return res.json({ user: sanitizeUser(enriched) });
    },

    async create(req, res) {
      if (!SERVICE_TEAM_EDIT_ROLES.includes(req.adminUser?.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const payload = normalizePayload(req.body);
      if (!payload.fullName || !payload.email || !payload.role || !payload.password) {
        return res.status(400).json({ error: 'invalid_payload' });
      }
      if (!canManageRole(req.adminUser?.role, payload.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const existing = await userRepository.findByEmail(payload.email);
      if (existing) {
        return res.status(409).json({ error: 'email_taken' });
      }

      const created = await userRepository.create({
        ...payload,
        passwordHash: hashPassword(payload.password),
      });

      const enriched = await enrichWithWorkload(created);
      return res.status(201).json({ user: sanitizeUser(enriched) });
    },

    async update(req, res) {
      const existing = await userRepository.getUserById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'user_not_found' });
      }
      if (!canManageUser(req.adminUser, existing)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const payload = normalizePayload(req.body);
      const next = { ...payload };

      if (next.role && !canManageRole(req.adminUser?.role, next.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      if (next.email && next.email !== existing.email) {
        const byEmail = await userRepository.findByEmail(next.email);
        if (byEmail && byEmail.id !== existing.id) {
          return res.status(409).json({ error: 'email_taken' });
        }
      }

      if (next.password !== undefined) {
        if (!next.password) {
          return res.status(400).json({ error: 'invalid_password' });
        }
        next.passwordHash = hashPassword(next.password);
        delete next.password;
      }

      const updated = await userRepository.updateUser(existing.id, next);
      const enriched = await enrichWithWorkload(updated);
      return res.json({ user: sanitizeUser(enriched) });
    },

    async listServiceEngineers(req, res) {
      if (!SERVICE_TEAM_VIEW_ROLES.includes(req.adminUser?.role)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const q = String(req.query?.q || '').trim();
      const users = await userRepository.listServiceEngineers({ q, isActive: true });
      const enriched = await Promise.all(users.map(enrichWithWorkload));
      return res.json({ users: enriched.map(sanitizeUser) });
    },

    async serviceSpecializations(req, res) {
      return res.json({ items: SERVICE_SPECIALIZATIONS });
    },

    async brands(req, res) {
      return res.json({ items: SERVICE_BRANDS });
    },

    async zones(req, res) {
      return res.json({ items: SERVICE_ZONES });
    },
  };
}
