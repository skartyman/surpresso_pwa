const TG_AUTH_LOG_PREFIX = '[tg-auth]';

const TELEGRAM_AUTH_ERROR = 'telegram_auth_required';
const TELEGRAM_CONTEXT_ERROR = 'telegram_context_required';

let loginPromise = null;

function logDebug(stage, payload = {}) {
  console.info(`${TG_AUTH_LOG_PREFIX} ${stage}`, payload);
}

export function getTelegramInitData() {
  const tgInitData = window.Telegram?.WebApp?.initData;
  if (tgInitData) return tgInitData;

  const queryInitData = new URLSearchParams(window.location.search).get('initData');
  return queryInitData || '';
}

export function getTelegramWebApp() {
  return window.Telegram?.WebApp || null;
}

export async function telegramLogin({ force = false } = {}) {
  if (!force && loginPromise) {
    return loginPromise;
  }

  loginPromise = (async () => {
    const webApp = getTelegramWebApp();
    const initData = getTelegramInitData();

    logDebug('login:start', {
      webAppAvailable: Boolean(webApp),
      initDataPresent: Boolean(initData),
    });

    if (!initData) {
      const error = new Error(TELEGRAM_CONTEXT_ERROR);
      error.code = TELEGRAM_CONTEXT_ERROR;
      throw error;
    }

    const response = await fetch('/api/telegram/v1/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const error = new Error(errorBody.error || TELEGRAM_AUTH_ERROR);
      error.status = response.status;
      throw error;
    }

    const payload = await response.json().catch(() => ({}));

    logDebug('login:ok', {
      authorized: Boolean(payload?.ok),
      hasSession: true,
    });

    return payload;
  })();

  try {
    return await loginPromise;
  } catch (error) {
    logDebug('login:failed', {
      status: error?.status || null,
      code: error?.code || error?.message || TELEGRAM_AUTH_ERROR,
    });
    throw error;
  } finally {
    loginPromise = null;
  }
}

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(errorBody.error || 'request_failed');
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function apiUpload(path, payload, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path, true);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || typeof onProgress !== 'function') return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      let responseBody = null;
      try {
        responseBody = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        responseBody = null;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(responseBody);
        return;
      }

      const error = new Error(responseBody?.error || 'request_failed');
      error.status = xhr.status;
      reject(error);
    };

    xhr.onerror = () => {
      const error = new Error('request_failed');
      error.status = 0;
      reject(error);
    };

    xhr.send(payload);
  });
}

export const telegramClientApi = {
  login: telegramLogin,
  me: async () => {
    logDebug('me:start');
    try {
      const response = await apiFetch('/api/telegram/v1/auth/me');
      logDebug('me:ok', { hasClient: Boolean(response?.client), hasUser: Boolean(response?.telegramUser) });
      return response;
    } catch (error) {
      logDebug('me:failed', { status: error?.status || null, error: error?.message || 'request_failed' });
      throw error;
    }
  },
  registerProfile: async (payload) => apiFetch('/api/telegram/v1/auth/register-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
  catalogProducts: async () => apiFetch('/api/telegram/catalog/products'),
  listEquipment: async () => apiFetch('/api/telegram/equipment'),
  equipmentById: async (id) => apiFetch(`/api/telegram/equipment/${id}`),
  listServiceRequests: async () => apiFetch('/api/telegram/service-requests'),
  createServiceRequest: async (payload, options = {}) => apiUpload('/api/telegram/service-requests', payload, options),
  serviceRequestStatus: async (id) => apiFetch(`/api/telegram/service-requests/${id}/status`),
  notifySupport: async (payload) => apiFetch('/api/telegram/support/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
};

export const telegramAuthErrors = {
  TELEGRAM_AUTH_ERROR,
  TELEGRAM_CONTEXT_ERROR,
};
