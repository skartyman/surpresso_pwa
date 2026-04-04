import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ADMIN_MENU, ROLE_LABELS } from '../roleConfig';
import { Icon, NotificationBell, ThemeToggle } from './AdminUi';

function useAdminTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('surpresso-admin-theme') || 'light');

  useEffect(() => {
    document.documentElement.dataset.adminTheme = theme;
    localStorage.setItem('surpresso-admin-theme', theme);
  }, [theme]);

  return { theme, toggleTheme: () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light')) };
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const basePath = location.pathname.startsWith('/tg/admin') ? '/tg/admin' : '/admin';
  const { theme, toggleTheme } = useAdminTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const menu = useMemo(() => ADMIN_MENU.filter((item) => item.roles.includes(user.role)), [user.role]);
  const title = menu.find((item) => location.pathname.includes(`/${item.to}`))?.label || 'Админка';

  return (
    <div className="admin-app-shell">
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-brand">
          <strong>Surpresso</strong>
          <span>Admin</span>
        </div>
        <nav>
          {menu.map((item) => (
            <NavLink key={item.key} to={`${basePath}/${item.to}`} className={({ isActive }) => `admin-link ${isActive ? 'active' : ''}`} onClick={() => setSidebarOpen(false)}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar__bottom">
          <div>
            <strong>{user.fullName || user.name}</strong>
            <span className="role-badge">{ROLE_LABELS[user.role]}</span>
          </div>
          <button className="secondary" onClick={logout}>Выйти</button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <button type="button" className="menu-toggle" onClick={() => setSidebarOpen((prev) => !prev)}>☰</button>
          <h1>{title}</h1>
          <label className="admin-search"><Icon name="search" /><input placeholder="Поиск по заявкам, клиентам, ID" /></label>
          <NotificationBell count={3} />
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>
        <section className="admin-content"><Outlet /></section>
      </main>
    </div>
  );
}
