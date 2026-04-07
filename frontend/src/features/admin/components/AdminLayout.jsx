import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { getAdminSections, getRoleLabels } from '../roleConfig';
import { Icon, NotificationBell, ThemeToggle } from './AdminUi';
import { useAdminI18n } from '../adminI18n';

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
  const { user, logout, changePassword } = useAuth();
  const location = useLocation();
  const { locale, toggleLocale, t } = useAdminI18n();
  const basePath = location.pathname.startsWith('/tg/admin') ? '/tg/admin' : '/admin';
  const { mode, resolvedTheme, cycleMode } = useAdminTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordStatus, setPasswordStatus] = useState({ type: '', message: '' });
  const sectionsSource = useMemo(() => getAdminSections(t), [t]);
  const roleLabels = useMemo(() => getRoleLabels(t), [t]);

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  const sections = useMemo(
    () => sectionsSource
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.roles.includes(user.role)),
      }))
      .filter((section) => section.items.length),
    [sectionsSource, user.role],
  );

  const currentItem = useMemo(() => {
    for (const section of sections) {
      const found = section.items.find((item) => location.pathname.includes(`/${item.to}`));
      if (found) return { ...found, sectionLabel: section.label };
    }
    return null;
  }, [sections, location.pathname]);

  const title = currentItem?.label || t('admin_panel');

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    setPasswordStatus({ type: '', message: '' });

    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      setPasswordStatus({ type: 'error', message: t('password_fill_required') });
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setPasswordStatus({ type: 'error', message: t('password_min_length') });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordStatus({ type: 'error', message: t('password_confirmation_mismatch') });
      return;
    }

    try {
      await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordStatus({ type: 'success', message: t('password_updated') });
      setPasswordOpen(false);
    } catch (error) {
      const message = error?.message === 'invalid_current_password'
        ? t('invalid_current_password')
        : (error?.message === 'password_too_short' ? t('password_min_length') : t('password_change_failed'));
      setPasswordStatus({ type: 'error', message });
    }
  }

  return (
    <div className="admin-app-shell">
      <div className="admin-app-shell__glow admin-app-shell__glow--one" />
      <div className="admin-app-shell__glow admin-app-shell__glow--two" />
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-brand">
          <img src="/icons/logo-service.png" alt="Surpresso" className="admin-brand__logo" />
          <div className="admin-brand__meta">
            <strong>Surpresso</strong>
            <span>{t('admin_panel')}</span>
          </div>
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
          <button type="button" className="secondary" onClick={toggleLocale}>
            {t('admin_lang')}: {locale.toUpperCase()}
          </button>
          <div>
            <strong>{user.fullName || user.name}</strong>
            <span className="role-badge">{roleLabels[user.role]}</span>
          </div>
          <button type="button" className="secondary" onClick={() => setPasswordOpen((prev) => !prev)}>{t('change_password')}</button>
          {passwordOpen ? (
            <form className="admin-password-form" onSubmit={handlePasswordSubmit}>
              <input
                type="password"
                placeholder={t('current_password')}
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, currentPassword: event.target.value }))}
                autoComplete="current-password"
              />
              <input
                type="password"
                placeholder={t('new_password')}
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                autoComplete="new-password"
              />
              <input
                type="password"
                placeholder={t('repeat_new_password')}
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                autoComplete="new-password"
              />
              {passwordStatus.message ? <p className={`admin-password-form__status ${passwordStatus.type}`}>{passwordStatus.message}</p> : null}
              <button type="submit">{t('update_password')}</button>
            </form>
          ) : null}
          <button type="button" className="secondary" onClick={logout}>{t('admin_logout')}</button>
        </div>
      </aside>

      {sidebarOpen ? <button type="button" className="admin-drawer-overlay" onClick={() => setSidebarOpen(false)} aria-label={t('admin_close_menu')} /> : null}

      <main className="admin-main">
        <header className="admin-topbar">
          <button type="button" className="menu-toggle" onClick={() => setSidebarOpen((prev) => !prev)}>☰</button>
          <div className="admin-topbar__heading">
            <small>{currentItem?.sectionLabel || t('admin_panel')}</small>
            <h1>{title}</h1>
          </div>
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
