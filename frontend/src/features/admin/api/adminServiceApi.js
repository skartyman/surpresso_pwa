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
  notificationCenter: async () => apiFetch('/api/telegram/admin/executive/notification-center'),
  digestPlan: async () => apiFetch('/api/telegram/admin/executive/digests/plan'),
  reportsHistory: async () => apiFetch('/api/telegram/admin/reports/history'),
  reportPresets: async () => apiFetch('/api/telegram/admin/reports/presets'),
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
  createEquipment: async (payload) => apiFetch('/api/telegram/admin/equipment', { method: 'POST', body: JSON.stringify(payload) }),
  deleteEquipment: async (id) => apiFetch(`/api/telegram/admin/equipment/${id}`, { method: 'DELETE' }),
  intakeCreate: async (payload) => apiFetch('/api/telegram/admin/intake', { method: 'POST', body: JSON.stringify(payload) }),
  updateEquipment: async (id, payload) => apiFetch(`/api/telegram/admin/equipment/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  equipmentDetail: async (id) => apiFetch(`/api/telegram/admin/equipment/${id}/detail`),
  addEquipmentComment: async (id, body) => apiFetch(`/api/telegram/admin/equipment/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
  addEquipmentNote: async (id, body) => apiFetch(`/api/telegram/admin/equipment/${id}/notes`, { method: 'POST', body: JSON.stringify({ body }) }),
  listEquipmentTasks: async (id) => apiFetch(`/api/telegram/admin/equipment/${id}/tasks`),
  createEquipmentTask: async (id, payload) => apiFetch(`/api/telegram/admin/equipment/${id}/tasks`, { method: 'POST', body: JSON.stringify(payload) }),
  updateTaskStatus: async (taskId, status) => apiFetch(`/api/telegram/admin/tasks/${taskId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  deleteMedia: async (mediaId) => apiFetch(`/api/telegram/admin/media/${mediaId}`, { method: 'DELETE' }),
  uploadEquipmentMedia: async (id, files, { caption = '', serviceCaseId = null } = {}) => {
    const form = new FormData();
    (files || []).forEach((file) => form.append('media', file));
    if (caption) form.append('caption', caption);
    if (serviceCaseId) form.append('serviceCaseId', serviceCaseId);
    return apiFetch(`/api/telegram/admin/equipment/${id}/media`, { method: 'POST', body: form });
  },
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
  createRequest: async (payload) => {
    const form = new FormData();
    Object.entries(payload || {}).forEach(([key, value]) => {
      if (key === 'media') return;
      if (value === undefined || value === null || value === '') return;
      form.append(key, typeof value === 'boolean' ? String(value) : value);
    });
    (payload?.media || []).forEach((file) => form.append('media', file));
    return apiFetch('/api/telegram/admin/service-requests', {
      method: 'POST',
      body: form,
    });
  },
  serviceEngineers: async () => apiFetch('/api/telegram/admin/service-engineers'),
  byId: async (id) => apiFetch(`/api/telegram/admin/service-requests/${id}`),
  delete: async (id) => apiFetch(`/api/telegram/admin/service-requests/${id}`, { method: 'DELETE' }),
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
  uploadRequestMedia: async (id, files, mediaStage = 'before') => {
    const form = new FormData();
    (files || []).forEach((file) => form.append('media', file));
    form.append('mediaStage', mediaStage);
    return apiFetch(`/api/telegram/admin/service-requests/${id}/media`, {
      method: 'POST',
      body: form,
    });
  },
};
