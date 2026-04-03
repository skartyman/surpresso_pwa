import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return (
    <section className="admin-page">
      <h1>403</h1>
      <p>Недостаточно прав для просмотра страницы.</p>
      <Link to="/tg/admin">Вернуться в админку</Link>
    </section>
  );
}
