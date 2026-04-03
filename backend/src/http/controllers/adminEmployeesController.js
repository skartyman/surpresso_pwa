import { hashPassword } from '../../domain/security/passwordHasher.js';

const ALLOWED_ROLES = new Set(['service_engineer', 'service_head', 'sales_manager', 'owner', 'director']);

function sanitizeUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function generateTempPassword() {
  return `Temp-${Math.random().toString(36).slice(2, 8)}A1!`;
}

export function createAdminEmployeesController(userRepository) {
  return {
    async list(_, res) {
      const users = await userRepository.list();
      return res.json({ employees: users.map(sanitizeUser) });
    },

    async create(req, res) {
      const fullName = String(req.body?.fullName || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      const phone = String(req.body?.phone || '').trim();
      const role = String(req.body?.role || '').trim();
      const positionTitle = String(req.body?.positionTitle || '').trim();

      if (!fullName || !email || !role) {
        return res.status(400).json({ error: 'full_name_email_role_required' });
      }
      if (!ALLOWED_ROLES.has(role)) {
        return res.status(400).json({ error: 'invalid_role' });
      }

      const exists = await userRepository.findByEmail(email);
      if (exists) {
        return res.status(409).json({ error: 'employee_email_exists' });
      }

      const tempPassword = String(req.body?.tempPassword || generateTempPassword());
      const created = await userRepository.create({
        fullName,
        email,
        phone,
        role,
        positionTitle,
        passwordHash: hashPassword(tempPassword),
        isActive: true,
      });

      return res.status(201).json({ employee: sanitizeUser(created), tempPassword });
    },

    async update(req, res) {
      const id = req.params.id;
      const payload = {
        ...(req.body?.fullName !== undefined ? { fullName: String(req.body.fullName || '').trim() } : {}),
        ...(req.body?.email !== undefined ? { email: String(req.body.email || '').trim().toLowerCase() } : {}),
        ...(req.body?.phone !== undefined ? { phone: String(req.body.phone || '').trim() } : {}),
        ...(req.body?.positionTitle !== undefined ? { positionTitle: String(req.body.positionTitle || '').trim() } : {}),
      };

      if (req.body?.role !== undefined) {
        const role = String(req.body.role || '').trim();
        if (!ALLOWED_ROLES.has(role)) {
          return res.status(400).json({ error: 'invalid_role' });
        }
        payload.role = role;
      }

      const updated = await userRepository.update(id, payload).catch(() => null);
      if (!updated) {
        return res.status(404).json({ error: 'employee_not_found' });
      }
      return res.json({ employee: sanitizeUser(updated) });
    },

    async setActive(req, res) {
      const updated = await userRepository.setActive(req.params.id, Boolean(req.body?.isActive)).catch(() => null);
      if (!updated) {
        return res.status(404).json({ error: 'employee_not_found' });
      }
      return res.json({ employee: sanitizeUser(updated) });
    },

    async resetPassword(req, res) {
      const tempPassword = String(req.body?.tempPassword || generateTempPassword());
      const updated = await userRepository.setPassword(req.params.id, hashPassword(tempPassword)).catch(() => null);
      if (!updated) {
        return res.status(404).json({ error: 'employee_not_found' });
      }
      const invitationToken = `invite-${req.params.id}-${Date.now()}`;
      return res.json({ employee: sanitizeUser(updated), tempPassword, invitationToken });
    },
  };
}
