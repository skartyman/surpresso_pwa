import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { getDefaultAdminSection } from '../roleConfig';

export function RoleGuard({ allowedRoles = [], children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    const basePath = location.pathname.startsWith('/tg/admin') ? '/tg/admin' : '/admin';
    return <Navigate to={`${basePath}/${getDefaultAdminSection(user.role)}`} replace />;
  }

  return children;
}
