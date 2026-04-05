import { SectionCard } from '../components/SectionCard';
import { routes } from '../app/routes';
import { useI18n } from '../i18n';

export function HomePage() {
  const { t } = useI18n();
  const sections = [
    { to: `${routes.requestForm}/service_repair`, title: t('type_service_repair'), subtitle: 'Сервісна заявка на ремонт обладнання' },
    { to: `${routes.requestForm}/coffee_order`, title: t('type_coffee_order'), subtitle: 'Запит постачання зерна та витратників' },
    { to: `${routes.requestForm}/coffee_tasting`, title: t('type_coffee_tasting'), subtitle: 'Запит дегустації та підбору лотів' },
    { to: `${routes.requestForm}/grinder_check`, title: t('type_grinder_check'), subtitle: 'Запит налаштування і консультації' },
    { to: `${routes.requestForm}/rental_auto`, title: t('type_rental_auto'), subtitle: 'Автоматичний пакет оренди обладнання' },
    { to: `${routes.requestForm}/rental_pro`, title: t('type_rental_pro'), subtitle: 'Професійний пакет оренди' },
    { to: `${routes.requestForm}/feedback`, title: t('type_feedback'), subtitle: 'Питання, пропозиції та відгуки' },
    { to: routes.service, title: t('requests_history'), subtitle: 'Створення заявки та відстеження статусу' },
    { to: routes.equipment, title: t('my_equipment'), subtitle: 'Парк техніки та історія обслуговування' },
    { to: routes.rentals, title: t('rentals'), subtitle: 'Договори та розширення парку' },
    { to: routes.coffee, title: t('coffee'), subtitle: 'Замовлення зерна та історія постачань' },
    { to: routes.supplies, title: t('supplies'), subtitle: 'Фільтри, хімія, стакани' },
    { to: routes.guides, title: t('guides'), subtitle: 'Чек-листи та навчальні матеріали' },
    { to: routes.support, title: t('support'), subtitle: 'Швидкий зв\'язок із менеджером' },
  ];

  return (
    <section>
      <header className="hero">
        <h1>Surpresso Client Desk</h1>
        <p>{t('hero_subtitle')}</p>
      </header>
      <div className="actions-row">
        <button>{t('create_request')}</button>
        <button className="secondary">{t('contact_manager')}</button>
      </div>
      <div className="cards-grid">
        {sections.map((section) => (
          <SectionCard key={section.title} {...section} />
        ))}
      </div>
    </section>
  );
}
