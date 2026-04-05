import { useParams } from 'react-router-dom';
import { useI18n } from '../i18n';

export function ServiceStatusPage() {
  const { requestId } = useParams();
  const { t } = useI18n();

  return (
    <section>
      <h1>{t('request_status')} {requestId}</h1>
      <div className="status-card">
        <p>{t('current_status')}: {t('in_progress')}</p>
        <p>{t('engineer_assigned')}</p>
      </div>
    </section>
  );
}
