import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ADMIN_MENU, ROLE_LABELS } from '../roleConfig';

export function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const basePath = location.pathname.startsWith('/tg/admin') ? '/tg/admin' : '/admin';
  const menu = ADMIN_MENU.filter((item) => item.roles.includes(user.role));

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <h2>Surpresso Admin</h2>
        <nav>
          {menu.map((item) => (
            <NavLink key={item.key} to={`${basePath}/${item.to}`} className={({ isActive }) => `admin-link ${isActive ? 'active' : ''}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section className="admin-content">
        <header className="admin-header">
          <div>
            <strong>{user.fullName || user.name}</strong>
            <span className="role-badge">{ROLE_LABELS[user.role]}</span>
          </div>
          <button className="secondary" onClick={logout}>Выйти</button>
        </header>
        <Outlet />
      </section>
    </div>
  );
}
