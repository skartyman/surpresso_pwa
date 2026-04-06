import { createHmac, timingSafeEqual } from 'crypto';
import { config } from '../../config/env.js';
import { validateTelegramInitData } from '../../infrastructure/telegram/validateInitData.js';

const TELEGRAM_COOKIE_NAME = 'surpresso_tg_session';
const TELEGRAM_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

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

function resolveIsSecureRequest(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

function toContactName(telegramUser = {}) {
  const first = String(telegramUser.first_name || '').trim();
  const last = String(telegramUser.last_name || '').trim();
  const full = `${first} ${last}`.trim();
  return full || String(telegramUser.username || '').trim() || `Telegram user ${telegramUser.id}`;
}

function sanitizeInitDataStats(initData = '') {
  const raw = String(initData || '');
  return {
    present: Boolean(raw),
    length: raw.length,
  };
}

function signTelegramSession(secret, payload) {
  const payloadRaw = toBase64Url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(payloadRaw).digest('base64url');
  return `${payloadRaw}.${signature}`;
}

function verifyTelegramSession(secret, token) {
  if (!token || !secret) return null;

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
    if (!payload?.telegramUser?.id || !payload?.exp || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function findOrCreateClient(clientRepository, telegramUser) {
  if (typeof clientRepository.findOrCreateFromTelegramUser === 'function') {
    return clientRepository.findOrCreateFromTelegramUser(telegramUser, {
      contactName: toContactName(telegramUser),
      companyName: 'Telegram client',
      phone: '',
      isActive: true,
    });
  }

  return clientRepository.findByTelegramUserId(telegramUser.id);
}

async function loadMiniAppProfile(clientRepository, telegramUserId) {
  if (typeof clientRepository.getMiniAppProfileByTelegramUserId === 'function') {
    return clientRepository.getMiniAppProfileByTelegramUserId(telegramUserId);
  }
  return null;
}

function getSessionCookieValue(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[TELEGRAM_COOKIE_NAME] || null;
}

function issueTelegramSessionToken(secret, telegramUser) {
  return signTelegramSession(secret, {
    telegramUser: {
      id: telegramUser.id,
      username: telegramUser.username || null,
      first_name: telegramUser.first_name || null,
      last_name: telegramUser.last_name || null,
    },
    exp: Date.now() + TELEGRAM_SESSION_TTL_MS,
  });
}

function setTelegramSessionCookie(req, res, token) {
  const secure = resolveIsSecureRequest(req);
  const cookieOptions = [
    `${TELEGRAM_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(TELEGRAM_SESSION_TTL_MS / 1000)}`,
  ];

  if (secure) {
    cookieOptions.push('Secure');
  }

  if (config.telegramSessionCookieDomain) {
    cookieOptions.push(`Domain=${config.telegramSessionCookieDomain}`);
  }

  res.setHeader('Set-Cookie', cookieOptions.join('; '));
}

function clearTelegramSessionCookie(req, res) {
  const secure = resolveIsSecureRequest(req);
  const cookieOptions = [
    `${TELEGRAM_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];

  if (secure) {
    cookieOptions.push('Secure');
  }

  if (config.telegramSessionCookieDomain) {
    cookieOptions.push(`Domain=${config.telegramSessionCookieDomain}`);
  }

  res.setHeader('Set-Cookie', cookieOptions.join('; '));
}

async function resolveAuth(req, clientRepository, { allowInitDataFallback = true } = {}) {
  const sessionToken = getSessionCookieValue(req);
  const sessionPayload = verifyTelegramSession(config.adminSessionSecret, sessionToken);

  if (sessionPayload?.telegramUser?.id) {
    const client = await findOrCreateClient(clientRepository, sessionPayload.telegramUser);

    if (client) {
      return {
        ok: true,
        source: 'session',
        telegramUser: sessionPayload.telegramUser,
        client,
      };
    }
  }

  if (!allowInitDataFallback) {
    return { ok: false, reason: 'session_missing_or_invalid' };
  }

  const initData = req.header('x-telegram-init-data') || req.query.initData || req.body?.initData;
  const validation = validateTelegramInitData(initData, config.telegramBotToken);

  if (!validation.valid || !validation.data?.user?.id) {
    return {
      ok: false,
      reason: 'init_data_invalid',
      initData: sanitizeInitDataStats(initData),
      validationPassed: Boolean(validation.valid),
    };
  }

  const telegramUser = validation.data.user;
  const client = await findOrCreateClient(clientRepository, telegramUser);

  if (!client) {
    return {
      ok: false,
      reason: 'client_profile_not_found',
      telegramUserId: String(telegramUser.id),
    };
  }

  return {
    ok: true,
    source: 'initData',
    telegramUser,
    client,
  };
}

export function createTelegramAuthController(clientRepository) {
  return {
    login: async (req, res) => {
      const initData = req.body?.initData || req.header('x-telegram-init-data') || req.query.initData;
      console.info('[telegramAuth] login requested', {
        initData: sanitizeInitDataStats(initData),
      });

      const validation = validateTelegramInitData(initData, config.telegramBotToken);

      if (!validation.valid || !validation.data?.user?.id) {
        console.warn('[telegramAuth] login rejected: invalid initData', {
          validationPassed: Boolean(validation.valid),
          initData: sanitizeInitDataStats(initData),
        });
        return res.status(401).json({ error: 'telegram_auth_required' });
      }

      const telegramUser = validation.data.user;
      const client = await findOrCreateClient(clientRepository, telegramUser);

      if (!client) {
        console.warn('[telegramAuth] login rejected: client profile not found', {
          telegramUserId: String(telegramUser.id),
        });
        return res.status(403).json({ error: 'client_profile_not_found' });
      }

      const token = issueTelegramSessionToken(config.adminSessionSecret, telegramUser);
      setTelegramSessionCookie(req, res, token);

      console.info('[telegramAuth] login success', {
        telegramUserId: String(telegramUser.id),
        sessionCreated: true,
        clientId: client.id,
      });

      return res.json({ ok: true });
    },
    logout: (req, res) => {
      clearTelegramSessionCookie(req, res);
      return res.status(204).end();
    },
  };
}

export function telegramAuth(clientRepository, options = {}) {
  const { allowInitDataFallback = true } = options;

  return async (req, res, next) => {
    const result = await resolveAuth(req, clientRepository, { allowInitDataFallback });

    if (!result.ok) {
      console.warn('[telegramAuth] authorization failed', {
        path: req.originalUrl,
        reason: result.reason,
        initData: result.initData || { present: false, length: 0 },
      });

      if (req.path.includes('/auth/me')) {
        console.warn('[telegramAuth] /me returned 401', {
          reason: result.reason,
          hasCookie: Boolean(getSessionCookieValue(req)),
        });
      }

      return res.status(401).json({ error: 'telegram_auth_required' });
    }

    req.auth = { telegramUser: result.telegramUser, client: result.client };
    const profile = await loadMiniAppProfile(clientRepository, result.telegramUser.id);
    if (profile) {
      req.auth = {
        ...req.auth,
        profile,
        pointUser: profile.pointUser || null,
        network: profile.network || null,
        location: profile.location || null,
      };
    }

    console.info('[telegramAuth] authorization success', {
      source: result.source,
      telegramUserId: String(result.telegramUser.id),
      clientId: result.client.id,
    });

    return next();
  };
}
