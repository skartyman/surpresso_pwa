import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ADMIN_SECTIONS, ROLE_LABELS } from '../roleConfig';
import { Icon, NotificationBell, ThemeToggle } from './AdminUi';

const STORAGE_KEY = 'surpresso-admin-theme-mode';

function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function useAdminTheme() {
  const [mode, setMode] = useState(() => localStorage.getItem(STORAGE_KEY) || 'system');
  const [systemTheme, setSystemTheme] = useState(() => resolveTheme('system'));

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleTheme = () => setSystemTheme(media.matches ? 'dark' : 'light');
    handleTheme();
    media.addEventListener('change', handleTheme);
    return () => media.removeEventListener('change', handleTheme);
  }, []);

  const resolvedTheme = mode === 'system' ? systemTheme : mode;

  useEffect(() => {
    document.documentElement.dataset.adminTheme = resolvedTheme;
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode, resolvedTheme]);

  const cycleMode = () => {
    setMode((prev) => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'system';
      return 'light';
    });
  };

  return { mode, resolvedTheme, cycleMode };
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const basePath = location.pathname.startsWith('/tg/admin') ? '/tg/admin' : '/admin';
  const { mode, resolvedTheme, cycleMode } = useAdminTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  const sections = useMemo(
    () => ADMIN_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.roles.includes(user.role)),
      }))
      .filter((section) => section.items.length),
    [user.role],
  );

  const title = useMemo(() => {
    for (const section of sections) {
      const found = section.items.find((item) => location.pathname.includes(`/${item.to}`));
      if (found) return found.label;
    }
    return 'Admin panel';
  }, [sections, location.pathname]);

  return (
    <div className="admin-app-shell">
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-brand">
          <strong>Surpresso</strong>
          <span>Role-driven Admin Panel</span>
        </div>

        <nav className="admin-sidebar-sections">
          {sections.map((section) => (
            <section key={section.key} className="admin-nav-group">
              <h4>{section.label}</h4>
              {section.items.map((item) => (
                <NavLink
                  key={item.key}
                  to={`${basePath}/${item.to}`}
                  className={({ isActive }) => `admin-link ${isActive ? 'active' : ''}`}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </section>
          ))}
        </nav>

        <div className="admin-sidebar__bottom">
          <ThemeToggle mode={mode} resolvedTheme={resolvedTheme} onToggle={cycleMode} />
          <div>
            <strong>{user.fullName || user.name}</strong>
            <span className="role-badge">{ROLE_LABELS[user.role]}</span>
          </div>
          <button className="secondary" onClick={logout}>Выйти</button>
        </div>
      </aside>

      {sidebarOpen ? <button type="button" className="admin-drawer-overlay" onClick={() => setSidebarOpen(false)} aria-label="Close menu" /> : null}

      <main className="admin-main">
        <header className="admin-topbar">
          <button type="button" className="menu-toggle" onClick={() => setSidebarOpen((prev) => !prev)}>☰</button>
          <h1>{title}</h1>
          <div className="admin-topbar-actions">
            <NotificationBell count={3} />
            <ThemeToggle mode={mode} resolvedTheme={resolvedTheme} onToggle={cycleMode} />
          </div>
        </header>
        <section className="admin-content"><Outlet /></section>
      </main>
    </div>
  );
}
