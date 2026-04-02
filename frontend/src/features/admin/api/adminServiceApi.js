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
  list: async ({ status } = {}) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return apiFetch(`/api/telegram/admin/service-requests${query}`);
  },
  byId: async (id) => apiFetch(`/api/telegram/admin/service-requests/${id}`),
  updateStatus: async (id, status) => apiFetch(`/api/telegram/admin/service-requests/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  }),
};
