import { NavLink } from 'react-router-dom';
import { routes } from '../app/routes';
import { useI18n } from '../i18n';

export function BottomNav() {
  const { t } = useI18n();
  const tabs = [
    { to: routes.home, label: t('nav_home') },
    { to: routes.service, label: t('nav_service') },
    { to: routes.equipment, label: t('nav_equipment') },
    { to: routes.support, label: t('nav_support') },
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
