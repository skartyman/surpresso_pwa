import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { routes } from '../app/routes';
import { telegramClientApi } from '../api/telegramClientApi';
import { useI18n } from '../i18n';

export function HomePage() {
  const { t } = useI18n();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    telegramClientApi.me()
      .then((data) => setProfile(data?.profile || null))
      .catch(() => setProfile(null));
  }, []);

  const cards = [
    { to: routes.equipment, title: t('nav_equipment_full'), subtitle: t('home_equipment_subtitle'), icon: '☕' },
    { to: routes.service, title: t('service_new'), subtitle: t('home_service_subtitle'), icon: '🛠️' },
    { to: routes.requests, title: t('nav_requests'), subtitle: t('home_requests_subtitle'), icon: '📋' },
    { to: routes.support, title: t('nav_support_full'), subtitle: t('home_support_subtitle'), icon: '💬' },
  ];

  return (
    <section className="client-home">
      <header className="hero hero--client">
        <div className="hero__copy">
          <small>{t('welcome_kicker')}</small>
          <h2>{t('welcome_title')}</h2>
          <p>{t('welcome_subtitle')}</p>
          <div className="hero__actions">
            <Link className="hero__link hero__link--primary" to={routes.service}>{t('welcome_cta_primary')}</Link>
            <Link className="hero__link" to={routes.equipment}>{t('welcome_cta_secondary')}</Link>
          </div>
        </div>

        <div className="hero__visual" aria-hidden="true">
          <div className="hero-orbit hero-orbit--one" />
          <div className="hero-orbit hero-orbit--two" />
          <div className="hero-device">
            <span>{t('home_highlight_network')}</span>
            <strong>Point-based equipment</strong>
            <em>{t('home_highlight_flow')}</em>
          </div>
          <div className="hero-chip hero-chip--service">{t('home_highlight_service')}</div>
          <div className="hero-chip hero-chip--network">{t('home_highlight_network')}</div>
        </div>
      </header>

      <section className="client-context-card">
        <div>
          <small>{t('home_context_title')}</small>
          <strong>{profile?.location?.name || t('home_context_missing')}</strong>
          <p>{profile?.network?.name || t('home_context_hint')}</p>
        </div>
        <span>{profile?.pointUser?.role || 'guest'}</span>
      </section>

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
