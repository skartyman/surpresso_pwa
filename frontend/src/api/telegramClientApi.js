const getTelegramInitData = () => {
  const tgInitData = window.Telegram?.WebApp?.initData;
  if (tgInitData) return tgInitData;

  const queryInitData = new URLSearchParams(window.location.search).get('initData');
  return queryInitData || '';
};

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const initData = getTelegramInitData();

  if (initData) {
    headers.set('x-telegram-init-data', initData);
  }

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

export const telegramClientApi = {
  me: async () => apiFetch('/api/telegram/auth/me'),
  listEquipment: async () => apiFetch('/api/telegram/equipment'),
  equipmentById: async (id) => apiFetch(`/api/telegram/equipment/${id}`),
  listServiceRequests: async () => apiFetch('/api/telegram/service-requests'),
  createServiceRequest: async (payload) => apiFetch('/api/telegram/service-requests', {
    method: 'POST',
    body: payload,
  }),
  serviceRequestStatus: async (id) => apiFetch(`/api/telegram/service-requests/${id}/status`),
  notifySupport: async (payload) => apiFetch('/api/telegram/support/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }),
};
