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

export const adminAnalyticsApi = {
  summary: async () => apiFetch('/api/telegram/admin/analytics/summary'),
};
