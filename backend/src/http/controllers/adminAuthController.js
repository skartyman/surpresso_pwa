import { verifyPassword } from '../../domain/security/passwordHasher.js';

function sanitizeUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

export function createAdminAuthController(userRepository, sessionManager) {
  return {
    login(req, res) {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');

      if (!email || !password) {
        return res.status(400).json({ error: 'email_password_required' });
      }

      const user = userRepository.findByEmail(email);
      if (!user || !user.isActive || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ error: 'invalid_credentials' });
      }

      const session = sessionManager.issueSession(user);
      res.setHeader(
        'Set-Cookie',
        `${sessionManager.cookieName}=${encodeURIComponent(session)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`,
      );

      return res.json({ user: sanitizeUser(user) });
    },

    logout(_, res) {
      res.setHeader(
        'Set-Cookie',
        `${sessionManager.cookieName}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`,
      );
      return res.status(204).send();
    },

    me(req, res) {
      return res.json({ user: sanitizeUser(req.adminUser) });
    },
  };
}
