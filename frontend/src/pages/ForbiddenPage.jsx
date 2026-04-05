import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { getDefaultAdminSection } from '../features/admin/roleConfig';
import { useI18n } from '../i18n';

export function ForbiddenPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const fallbackSection = getDefaultAdminSection(user?.role);
  const fallbackLink = `/admin/${fallbackSection}`;
  return (
    <section className="admin-page">
      <h1>403</h1>
      <p>{t('forbidden_text')}</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <Link to={fallbackLink}>{t('go_allowed')}</Link>
        <Link to="/">{t('go_home')}</Link>
      </div>
    </section>
  );
}
