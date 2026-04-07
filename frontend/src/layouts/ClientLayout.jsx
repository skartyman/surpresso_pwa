import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { routes } from '../app/routes';
import { useI18n } from '../i18n';

const THEME_KEY = 'surpresso_theme';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function ClientLayout({ children }) {
  const { locale, setLocale, t } = useI18n();
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  }, [theme]);

  const navItems = useMemo(
    () => [
      { to: routes.home, label: t('nav_home') },
      { to: routes.equipment, label: t('nav_equipment_full') },
      { to: routes.service, label: t('nav_service') },
      { to: routes.requests, label: t('nav_requests') },
      { to: routes.support, label: t('nav_support_full') },
      { to: routes.profile, label: t('nav_profile') },
    ],
    [t],
  );

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="client-shell">
      <aside className={`client-sidebar ${drawerOpen ? 'is-open' : ''}`}>
        <div className="client-sidebar__brand">
          <img src="/icons/logo-service.png" alt="Surpresso" className="client-logo-image" />
          <div>
            <strong>Surpresso</strong>
            <p>{t('client_cabinet')}</p>
          </div>
        </div>

        <div className="client-sidebar__promo">
          <small>{t('welcome_kicker')}</small>
          <strong>{t('workshop_flow')}</strong>
          <p>{t('client_promo')}</p>
        </div>

        <nav className="client-nav">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `client-nav__item ${isActive ? 'active' : ''}`} onClick={closeDrawer}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="client-sidebar__actions">
          <button type="button" className="secondary" onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}>
            {theme === 'dark' ? t('theme_light') : t('theme_dark')}
          </button>
          <button type="button" className="secondary" onClick={() => setLocale(locale === 'uk' ? 'ru' : 'uk')}>
            {t('lang_switch')}: {locale.toUpperCase()}
          </button>
        </div>
      </aside>

      {drawerOpen ? <button type="button" className="client-overlay" onClick={closeDrawer} aria-label={t('close_sidebar')} /> : null}

      <div className="client-main-wrap">
        <header className="client-topbar">
          <button type="button" className="menu-btn secondary" onClick={() => setDrawerOpen((prev) => !prev)}>
            ☰
          </button>
          <div className="client-topbar__title">
            <small>{t('welcome_kicker')}</small>
            <h1>{t('app_title')}</h1>
          </div>
          <button type="button" className="theme-inline-btn secondary" onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </header>
        <main className="client-content">{children}</main>

        <nav className="client-bottom-nav">
          {navItems.slice(0, 4).map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
