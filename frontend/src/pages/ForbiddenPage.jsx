import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { getDefaultAdminSection } from '../features/admin/roleConfig';

export function ForbiddenPage() {
  const { user } = useAuth();
  const fallbackSection = getDefaultAdminSection(user?.role);
  const fallbackLink = `/admin/${fallbackSection}`;
  return (
    <section className="admin-page">
      <h1>403</h1>
      <p>У вас нет прав для этого раздела. Вернитесь в доступный раздел админки или на главную страницу.</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <Link to={fallbackLink}>Перейти в доступный раздел</Link>
        <Link to="/">На главную</Link>
      </div>
    </section>
  );
}
