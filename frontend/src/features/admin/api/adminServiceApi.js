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
  serviceDashboard: async () => apiFetch('/api/telegram/admin/service/dashboard'),
  serviceCases: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '' && value !== 'all') params.set(key, value);
    });
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiFetch(`/api/telegram/admin/service-cases${query}`);
  },
  serviceCaseById: async (id) => apiFetch(`/api/telegram/admin/service-cases/${id}`),
  assignServiceCase: async (id, assignedToUserId) => apiFetch(`/api/telegram/admin/service-cases/${id}/assign`, { method: 'POST', body: JSON.stringify({ assignedToUserId }) }),
  updateServiceCaseStatus: async (id, payload) => apiFetch(`/api/telegram/admin/service-cases/${id}/status`, { method: 'POST', body: JSON.stringify(payload) }),
  addServiceCaseNote: async (id, body) => apiFetch(`/api/telegram/admin/service-cases/${id}/note`, { method: 'POST', body: JSON.stringify({ body }) }),
  serviceCaseHistory: async (id) => apiFetch(`/api/telegram/admin/service-cases/${id}/history`),
  equipmentList: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '' && value !== 'all') params.set(key, value);
    });
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiFetch(`/api/telegram/admin/equipment${query}`);
  },
  equipmentById: async (id) => apiFetch(`/api/telegram/admin/equipment/${id}`),
  equipmentServiceCases: async (id) => apiFetch(`/api/telegram/admin/equipment/${id}/service-cases`),
  updateCommercialStatus: async (id, commercialStatus, comment = '') => apiFetch(`/api/telegram/admin/equipment/${id}/commercial-status`, { method: 'POST', body: JSON.stringify({ commercialStatus, comment }) }),
  list: async ({ status, type, id, client, equipment, engineer, sort } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    if (id) params.set('id', id);
    if (client) params.set('client', client);
    if (equipment) params.set('equipment', equipment);
    if (engineer) params.set('engineer', engineer);
    if (sort) params.set('sort', sort);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiFetch(`/api/telegram/admin/service-requests${query}`);
  },
  dashboard: async ({ status, type, engineer } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    if (engineer) params.set('engineer', engineer);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiFetch(`/api/telegram/admin/service-requests/dashboard${query}`);
  },
  serviceEngineers: async () => apiFetch('/api/telegram/admin/service-engineers'),
  byId: async (id) => apiFetch(`/api/telegram/admin/service-requests/${id}`),
  updateStatus: async (id, status, comment = '') => apiFetch(`/api/telegram/admin/service-requests/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, comment }),
  }),
  assignManager: async (id, assignedToUserId, comment = '') => apiFetch(`/api/telegram/admin/service-requests/${id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ assignedToUserId, comment }),
  }),
  assignmentHistory: async (id) => apiFetch(`/api/telegram/admin/service-requests/${id}/assignment-history`),
  history: async (id) => apiFetch(`/api/telegram/admin/service-requests/${id}/history`),
  notes: async (id) => apiFetch(`/api/telegram/admin/service-requests/${id}/notes`),
  addNote: async (id, text) => apiFetch(`/api/telegram/admin/service-requests/${id}/notes`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  }),
};
