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

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const authApi = {
  me: async () => apiFetch('/api/telegram/auth/me'),
  login: async (email, password) => apiFetch('/api/telegram/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: async () => apiFetch('/api/telegram/auth/logout', { method: 'POST' }),
};
