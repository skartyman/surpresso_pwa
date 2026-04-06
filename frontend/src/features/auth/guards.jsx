import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <div className="auth-loading">Загрузка...</div>;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function RequireRole({ allowedRoles = [] }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <div className="auth-loading">Загрузка...</div>;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/403" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
