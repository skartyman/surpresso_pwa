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
    <section>
      <h2>{t('requests_history')}</h2>
      <div className="list">
        {items.map((item) => (
          <Link className="list-item" key={item.id} to={`/requests/${item.id}`}>
            <strong>{item.title || item.id}</strong>
            <p>{item.description}</p>
            <small>{t('status')}: {item.status} · {new Date(item.createdAt).toLocaleString(dateLocale)}</small>
          </Link>
        ))}
        {!items.length ? <p>{t('no_requests')}</p> : null}
      </div>
    </section>
  );
}
