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
  list: async ({ q, role, isActive } = {}) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (role) params.set('role', role);
    if (isActive !== undefined && isActive !== null && isActive !== '') params.set('isActive', String(isActive));
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiFetch(`/api/telegram/admin/employees${query}`);
  },
  byId: async (id) => apiFetch(`/api/telegram/admin/employees/${id}`),
  create: async (payload) => apiFetch('/api/telegram/admin/employees', { method: 'POST', body: JSON.stringify(payload) }),
  update: async (id, payload) => apiFetch(`/api/telegram/admin/employees/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
};
