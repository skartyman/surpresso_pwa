import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { telegramClientApi } from '../api/telegramClientApi';
import { useI18n } from '../i18n';

export function ServiceStatusPage() {
  const { requestId } = useParams();
  const { t, dateLocale } = useI18n();
  const [statusData, setStatusData] = useState(null);

  useEffect(() => {
    telegramClientApi.serviceRequestStatus(requestId).then(setStatusData);
  }, [requestId]);

  if (!statusData) return <p>{t('loading')}</p>;

  return (
    <section>
      <h2>{t('request_status')} {requestId}</h2>
      <div className="status-card">
        <p>{t('current_status')}: {statusData.status}</p>
        <p>{new Date(statusData.updatedAt).toLocaleString(dateLocale)}</p>
      </div>
    </section>
  );
}
