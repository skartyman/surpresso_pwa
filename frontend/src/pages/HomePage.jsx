import { Link } from 'react-router-dom';
import { routes } from '../app/routes';
import { useI18n } from '../i18n';

export function HomePage() {
  const { t } = useI18n();

  const cards = [
    { to: routes.equipment, title: t('nav_equipment_full'), subtitle: t('home_equipment_subtitle'), icon: '☕' },
    { to: routes.service, title: t('service_new'), subtitle: t('home_service_subtitle'), icon: '🛠️' },
    { to: routes.requests, title: t('nav_requests'), subtitle: t('home_requests_subtitle'), icon: '📋' },
    { to: routes.support, title: t('nav_support_full'), subtitle: t('home_support_subtitle'), icon: '💬' },
  ];

  return (
    <section>
      <header className="hero">
        <h2>{t('welcome_title')}</h2>
        <p>{t('welcome_subtitle')}</p>
      </header>

      <div className="cards-grid">
        {cards.map((card) => (
          <Link className="section-card" key={card.to} to={card.to}>
            <div className="section-card__media" aria-hidden="true">{card.icon}</div>
            <div>
              <strong>{card.title}</strong>
              <p>{card.subtitle}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
