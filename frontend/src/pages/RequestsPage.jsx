import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { telegramClientApi } from '../api/telegramClientApi';
import { useI18n } from '../i18n';

export function RequestsPage() {
  const { t, dateLocale } = useI18n();
  const [items, setItems] = useState([]);

  useEffect(() => {
    telegramClientApi.listServiceRequests().then((data) => {
      setItems(Array.isArray(data?.items) ? data.items : []);
    });
  }, []);

  return (
    <section className="client-page">
      <header className="client-page__header">
        <div>
          <small>{t('active_requests')}</small>
          <h2>{t('requests_history')}</h2>
          <p>{t('requests_empty_hint')}</p>
        </div>
      </header>
      <div className="list client-requests-list">
        {items.map((item) => (
          <Link className="list-item client-request-row" key={item.id} to={`/requests/${item.id}`}>
            <div className="client-request-row__head">
              <strong>{item.title || item.id}</strong>
              <span>{item.status}</span>
            </div>
            <p>{item.description}</p>
            <small>
              {t('request_created')}: {new Date(item.createdAt).toLocaleString(dateLocale)} · {t('request_department')}: {item.assignedDepartment || 'service'}
            </small>
          </Link>
        ))}
        {!items.length ? <p className="empty-copy">{t('no_requests')}</p> : null}
      </div>
    </section>
  );
}
