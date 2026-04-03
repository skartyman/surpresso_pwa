import { SectionCard } from '../components/SectionCard';
import { routes } from '../app/routes';

const sections = [
  { to: `${routes.requestForm}/service_repair`, title: 'Ремонт и сервис', subtitle: 'Сервисная заявка на ремонт оборудования' },
  { to: `${routes.requestForm}/coffee_order`, title: 'Заказать кофе', subtitle: 'Запрос поставки зерна и расхода' },
  { to: `${routes.requestForm}/coffee_tasting`, title: 'Дегустация', subtitle: 'Запрос дегустации и подбора лотов' },
  { to: `${routes.requestForm}/grinder_check`, title: 'Проверка помола', subtitle: 'Запрос настройки и консультации' },
  { to: `${routes.requestForm}/rental_auto`, title: 'Аренда авто', subtitle: 'Автоматический пакет аренды оборудования' },
  { to: `${routes.requestForm}/rental_pro`, title: 'Аренда проф.', subtitle: 'Профессиональный пакет аренды' },
  { to: `${routes.requestForm}/feedback`, title: 'Обратная связь', subtitle: 'Вопросы, предложения и отзывы' },
  { to: routes.service, title: 'История сервиса', subtitle: 'Создание заявки и отслеживание статуса' },
  { to: routes.equipment, title: 'Мое оборудование', subtitle: 'Парк техники и история обслуживания' },
  { to: routes.rentals, title: 'Аренда', subtitle: 'Договоры и расширение парка' },
  { to: routes.coffee, title: 'Кофе', subtitle: 'Заказы зерна и история поставок' },
  { to: routes.supplies, title: 'Расходники', subtitle: 'Фильтры, химия, стаканы' },
  { to: routes.guides, title: 'Инструкции', subtitle: 'Чек-листы и обучающие материалы' },
  { to: routes.support, title: 'Поддержка', subtitle: 'Быстрая связь с менеджером' },
];

export function HomePage() {
  return (
    <section>
      <header className="hero">
        <h1>Surpresso Client Desk</h1>
        <p>Единая точка управления сервисом, оборудованием и заказами внутри Telegram.</p>
      </header>
      <div className="actions-row">
        <button>Создать заявку</button>
        <button className="secondary">Связаться с менеджером</button>
      </div>
      <div className="cards-grid">
        {sections.map((section) => (
          <SectionCard key={section.title} {...section} />
        ))}
      </div>
    </section>
  );
}
