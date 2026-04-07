import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from './authApi';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  const refreshMe = useCallback(async () => {
    setStatus('loading');

    try {
      const data = await authApi.me();
      setUser(data.user);
      sessionStorage.setItem('surpresso-user', JSON.stringify(data.user));
      setStatus('authenticated');
    } catch (error) {
      setUser(null);
      sessionStorage.removeItem('surpresso-user');
      if (error?.status === 401) {
        setStatus('unauthenticated');
        return;
      }
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    const path = window.location.pathname || '';
    const shouldCheckAdminSession = /^\/(tg\/)?(admin|login)(\/|$)/.test(path);

    if (shouldCheckAdminSession) {
      refreshMe();
      return;
    }

    setUser(null);
    sessionStorage.removeItem('surpresso-user');
    setStatus('unauthenticated');
  }, [refreshMe]);

  const login = useCallback(async (email, password) => {
    const data = await authApi.login(email, password);
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
    sessionStorage.removeItem('surpresso-user');
    setStatus('unauthenticated');
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const data = await authApi.changePassword(currentPassword, newPassword);
    if (data?.user) {
      setUser(data.user);
      sessionStorage.setItem('surpresso-user', JSON.stringify(data.user));
    }
    return data;
  }, []);

  const value = useMemo(
    () => ({ user, status, login, logout, refreshMe, changePassword }),
    [user, status, login, logout, refreshMe, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
