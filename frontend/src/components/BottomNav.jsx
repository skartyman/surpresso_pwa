import { NavLink } from 'react-router-dom';
import { routes } from '../app/routes';

const tabs = [
  { to: routes.home, label: 'Главная' },
  { to: routes.service, label: 'Сервис' },
  { to: routes.equipment, label: 'Оборуд.' },
  { to: routes.support, label: 'Поддержка' },
];

export function BottomNav() {
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
