async function apiFetch(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(path, {
    credentials: 'include',
    headers: { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) },
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
  serviceKpi: async () => apiFetch('/api/telegram/admin/service/kpi'),
  executiveSummary: async () => apiFetch('/api/telegram/admin/executive/summary'),
  executiveAlerts: async () => apiFetch('/api/telegram/admin/executive/alerts'),
  notificationsPreview: async () => apiFetch('/api/telegram/admin/executive/notifications/preview'),
  triggerNotifications: async (roles = []) => apiFetch('/api/telegram/admin/executive/notifications/trigger', { method: 'POST', body: JSON.stringify({ roles }) }),
  weeklyExecutiveReport: async () => apiFetch('/api/telegram/admin/reports/executive-weekly'),
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
  directorProcessServiceCase: async (id, payload) => apiFetch(`/api/telegram/admin/director/service-cases/${id}/process`, { method: 'POST', body: JSON.stringify(payload) }),
  directorQueue: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '' && value !== 'all') params.set(key, value);
    });
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiFetch(`/api/telegram/admin/director/queue${query}`);
  },
  directorCommercialRoute: async (id, commercialStatus, comment = '') => apiFetch(`/api/telegram/admin/director/service-cases/${id}/commercial-route`, { method: 'POST', body: JSON.stringify({ serviceCaseId: id, commercialStatus, comment }) }),
  addServiceCaseNote: async (id, body, isInternal = true) => apiFetch(`/api/telegram/admin/service-cases/${id}/note`, { method: 'POST', body: JSON.stringify({ body, isInternal }) }),
  uploadServiceCaseMedia: async (id, files, caption = '') => {
    const form = new FormData();
    (files || []).forEach((file) => form.append('media', file));
    if (caption) form.append('caption', caption);
    return apiFetch(`/api/telegram/admin/service-cases/${id}/media`, { method: 'POST', body: form });
  },
  serviceCaseHistory: async (id) => apiFetch(`/api/telegram/admin/service-cases/${id}/history`),
  equipmentDashboard: async () => apiFetch('/api/telegram/admin/equipment/dashboard'),
  equipmentList: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '' && value !== 'all') params.set(key, value);
    });
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiFetch(`/api/telegram/admin/equipment${query}`);
  },
  equipmentById: async (id) => apiFetch(`/api/telegram/admin/equipment/${id}`),
  equipmentDetail: async (id) => apiFetch(`/api/telegram/admin/equipment/${id}/detail`),
  equipmentServiceCases: async (id) => apiFetch(`/api/telegram/admin/equipment/${id}/service-cases`),
  salesEquipment: async (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '' && value !== 'all') params.set(key, value);
    });
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiFetch(`/api/telegram/admin/sales/equipment${query}`);
  },
  updateCommercialStatus: async (id, commercialStatus, comment = '', serviceCaseId = null) => apiFetch(`/api/telegram/admin/equipment/${id}/commercial-status`, { method: 'POST', body: JSON.stringify({ commercialStatus, comment, serviceCaseId }) }),
  reserveRent: async (id, serviceCaseId = null) => apiFetch(`/api/telegram/admin/equipment/${id}/reserve-rent`, { method: 'POST', body: JSON.stringify({ serviceCaseId }) }),
  reserveSale: async (id, serviceCaseId = null) => apiFetch(`/api/telegram/admin/equipment/${id}/reserve-sale`, { method: 'POST', body: JSON.stringify({ serviceCaseId }) }),
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
