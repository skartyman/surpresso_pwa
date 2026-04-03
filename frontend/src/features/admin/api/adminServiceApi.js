async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(errorBody.error || 'request_failed');
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export const adminServiceApi = {
  list: async ({ status, id, client, equipment } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (id) params.set('id', id);
    if (client) params.set('client', client);
    if (equipment) params.set('equipment', equipment);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiFetch(`/api/telegram/admin/service-requests${query}`);
  },
  byId: async (id) => apiFetch(`/api/telegram/admin/service-requests/${id}`),
  updateStatus: async (id, status, comment = '') => apiFetch(`/api/telegram/admin/service-requests/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, comment }),
  }),
  history: async (id) => apiFetch(`/api/telegram/admin/service-requests/${id}/history`),
  notes: async (id) => apiFetch(`/api/telegram/admin/service-requests/${id}/notes`),
  addNote: async (id, text) => apiFetch(`/api/telegram/admin/service-requests/${id}/notes`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  }),
  assign: async (id, assignedToUserId) => apiFetch(`/api/telegram/admin/service-requests/${id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ assignedToUserId }),
  }),
};
