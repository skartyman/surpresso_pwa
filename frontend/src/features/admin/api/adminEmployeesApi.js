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

export const adminEmployeesApi = {
  list: async () => apiFetch('/api/telegram/admin/employees'),
  create: async (payload) => apiFetch('/api/telegram/admin/employees', { method: 'POST', body: JSON.stringify(payload) }),
  update: async (id, payload) => apiFetch(`/api/telegram/admin/employees/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  setActive: async (id, isActive) => apiFetch(`/api/telegram/admin/employees/${id}/active`, { method: 'POST', body: JSON.stringify({ isActive }) }),
  resetPassword: async (id) => apiFetch(`/api/telegram/admin/employees/${id}/reset-password`, { method: 'POST', body: JSON.stringify({}) }),
};
