import { createHmac, timingSafeEqual } from 'crypto';

const COOKIE_NAME = 'surpresso_admin_session';

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function fromBase64Url(value) {
  return Buffer.from(value, 'base64url').toString();
}

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf('=');
      if (idx === -1) {
        return acc;
      }
      const key = part.slice(0, idx);
      const value = decodeURIComponent(part.slice(idx + 1));
      acc[key] = value;
      return acc;
    }, {});
}

export function createAdminSessionManager(secret) {
  function sign(payload) {
    const payloadRaw = toBase64Url(JSON.stringify(payload));
    const signature = createHmac('sha256', secret).update(payloadRaw).digest('base64url');
    return `${payloadRaw}.${signature}`;
  }

  function verify(token) {
    if (!token || !secret) {
      return null;
    }
    const [payloadRaw, signature] = String(token).split('.');
    if (!payloadRaw || !signature) {
      return null;
    }

    const expected = createHmac('sha256', secret).update(payloadRaw).digest('base64url');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);

    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }

    try {
      const payload = JSON.parse(fromBase64Url(payloadRaw));
      if (!payload?.userId || !payload?.exp || Date.now() > payload.exp) {
        return null;
      }
      return payload;
    } catch {
      return null;
    }
  }

  function issueSession(user) {
    return sign({ userId: user.id, role: user.role, exp: Date.now() + 1000 * 60 * 60 * 12 });
  }

  function readToken(req) {
    const cookies = parseCookies(req.headers.cookie);
    return cookies[COOKIE_NAME] || null;
  }

  return { issueSession, verify, readToken, cookieName: COOKIE_NAME };
}

export function requireAuth(userRepository, sessionManager) {
  return async (req, res, next) => {
    const token = sessionManager.readToken(req);
    const payload = sessionManager.verify(token);

    if (!payload) {
      return res.status(401).json({ error: 'auth_required' });
    }

    const user = await userRepository.findById(payload.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'auth_required' });
    }

    req.adminUser = user;
    return next();
  };
}

export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.adminUser) {
      return res.status(401).json({ error: 'auth_required' });
    }

    if (!allowedRoles.includes(req.adminUser.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    return next();
  };
}
