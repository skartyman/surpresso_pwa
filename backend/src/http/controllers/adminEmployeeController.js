import { hashPassword } from '../../domain/security/passwordHasher.js';

const ALLOWED_ROLES = ['service_engineer', 'service_head', 'sales_manager', 'owner', 'director'];

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return ALLOWED_ROLES.includes(role) ? role : null;
}

export function createAdminEmployeeController(userRepository) {
  return {
    async list(req, res) {
      const q = String(req.query?.q || '').trim();
      const role = normalizeRole(req.query?.role);
      const isActiveRaw = req.query?.isActive;
      const isActive = isActiveRaw === undefined || isActiveRaw === '' ? null : String(isActiveRaw) === 'true';

      const users = await userRepository.listForAdmin({ q, role, isActive });
      return res.json({ users: users.map(sanitizeUser) });
    },

    async byId(req, res) {
      const user = await userRepository.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ error: 'user_not_found' });
      }
      return res.json({ user: sanitizeUser(user) });
    },

    async create(req, res) {
      const fullName = String(req.body?.fullName || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const phone = String(req.body?.phone || '').trim();
      const positionTitle = String(req.body?.positionTitle || '').trim();
      const role = normalizeRole(req.body?.role);
      const password = String(req.body?.password || '');

      if (!fullName || !email || !positionTitle || !role || !password) {
        return res.status(400).json({ error: 'invalid_payload' });
      }

      const existing = await userRepository.findByEmail(email);
      if (existing) {
        return res.status(409).json({ error: 'email_taken' });
      }

      const created = await userRepository.create({
        fullName,
        email,
        phone,
        role,
        positionTitle,
        isActive: true,
        passwordHash: hashPassword(password),
      });

      return res.status(201).json({ user: sanitizeUser(created) });
    },

    async update(req, res) {
      const existing = await userRepository.findById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: 'user_not_found' });
      }

      const next = {};
      if (req.body?.fullName !== undefined) next.fullName = String(req.body.fullName || '').trim();
      if (req.body?.email !== undefined) next.email = String(req.body.email || '').trim().toLowerCase();
      if (req.body?.phone !== undefined) next.phone = String(req.body.phone || '').trim();
      if (req.body?.positionTitle !== undefined) next.positionTitle = String(req.body.positionTitle || '').trim();
      if (req.body?.isActive !== undefined) next.isActive = Boolean(req.body.isActive);
      if (req.body?.role !== undefined) next.role = normalizeRole(req.body.role);

      if (Object.prototype.hasOwnProperty.call(next, 'role') && !next.role) {
        return res.status(400).json({ error: 'invalid_role' });
      }
      if (Object.prototype.hasOwnProperty.call(next, 'email') && !next.email) {
        return res.status(400).json({ error: 'invalid_email' });
      }

      if (next.email && next.email !== existing.email) {
        const byEmail = await userRepository.findByEmail(next.email);
        if (byEmail && byEmail.id !== existing.id) {
          return res.status(409).json({ error: 'email_taken' });
        }
      }

      const updated = await userRepository.updateById(existing.id, next);
      return res.json({ user: sanitizeUser(updated) });
    },
  };
}
