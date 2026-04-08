import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { getDefaultAdminSection } from '../features/admin/roleConfig';
import { useI18n } from '../i18n';

export function ForbiddenPage() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const basePath = location.pathname.startsWith('/tg/') ? '/tg' : '';
  const fallbackSection = getDefaultAdminSection(user?.role).replace(/^\//, '');
  const fallbackLink = `${basePath}/admin/${fallbackSection}`;

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      navigate(`${basePath}/login`, { replace: true });
    }
  }

  return (
    <section className="admin-page forbidden-page">
      <div className="forbidden-card">
        <small className="forbidden-card__code">403</small>
        <h1>{t('forbidden_title')}</h1>
        <p>{t('forbidden_text')}</p>
        <div className="forbidden-card__actions">
          <Link className="forbidden-card__action forbidden-card__action--primary" to={fallbackLink}>{t('go_allowed')}</Link>
          <button type="button" className="forbidden-card__action" onClick={handleLogout} disabled={isLoggingOut}>
            {isLoggingOut ? t('loading') : t('logout_button')}
          </button>
          <Link className="forbidden-card__action" to="/">{t('go_home')}</Link>
        </div>
      </div>
    </section>
  );
}
