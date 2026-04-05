import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

export function SectionCard({ to, title, subtitle, action }) {
  const { t } = useI18n();
  return (
    <Link to={to} className="section-card">
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <span>{action || t('action_open')}</span>
    </Link>
  );
}
