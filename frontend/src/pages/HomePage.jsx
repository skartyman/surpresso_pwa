import { SectionCard } from '../components/SectionCard';
import { routes } from '../app/routes';

const sections = [
  { to: routes.service, title: 'Сервис', subtitle: 'Создание заявки и отслеживание статуса' },
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
