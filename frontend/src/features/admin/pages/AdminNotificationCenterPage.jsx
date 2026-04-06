import { useEffect, useState } from 'react';
import { adminServiceApi } from '../api/adminServiceApi';
import { Icon, KPIChipCard } from '../components/AdminUi';

export function AdminNotificationCenterPage() {
  const [state, setState] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [center, plan] = await Promise.all([
          adminServiceApi.notificationCenter(),
          adminServiceApi.digestPlan().catch(() => null),
        ]);
        setState(center || null);
        setSchedule(plan || null);
        setError('');
      } catch {
        setError('Нет доступа к notification center для вашей роли или сервис временно недоступен.');
      }
    }
    load();
  }, []);

  const delivery = state?.deliveryState || {};
  const logs = state?.lastSentNotifications || [];

  return (
    <section className="service-dashboard">
      <header className="service-headline">
        <div>
          <h2>Notification Center</h2>
          <p>Delivery state, последние отправки и план digest без изменения backend контрактов.</p>
        </div>
      </header>

      <div className="kpi-row">
        <KPIChipCard label="Sent" value={delivery.sent || 0} icon="bell" hint="Delivery state" />
        <KPIChipCard label="Retry pending" value={delivery.retry_pending || 0} icon="bell" hint="Требуют повторной отправки" />
        <KPIChipCard label="Failed" value={delivery.failed || 0} icon="bell" hint="Ошибки доставки" />
        <KPIChipCard label="Next digest" value={schedule?.nextDigestAt ? new Date(schedule.nextDigestAt).toLocaleDateString('ru-RU') : '—'} icon="dashboard" hint="Планировщик" />
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="owner-grid owner-grid--2">
        <article className="owner-card">
          <header><h3><Icon name="bell" /> Last sent notifications</h3></header>
          <ul className="simple-list">
            {logs.slice(0, 15).map((item) => (
              <li key={item.id || `${item.recipientRole}-${item.createdAt}`}>
                {item.recipientRole || 'role'} · {item.status || '—'} · {item.createdAt ? new Date(item.createdAt).toLocaleString('ru-RU') : '—'}
              </li>
            ))}
            {!logs.length ? <li>Отправок пока нет.</li> : null}
          </ul>
        </article>

        <article className="owner-card">
          <header><h3><Icon name="dashboard" /> Bottlenecks</h3></header>
          <ul className="simple-list">
            {(state?.topWorseningBottlenecks || []).map((item, idx) => (
              <li key={`${item.type || idx}-${idx}`}>{item.message || item.type || '—'}</li>
            ))}
            {!(state?.topWorseningBottlenecks || []).length ? <li>Критичных bottleneck сейчас нет.</li> : null}
          </ul>
        </article>
      </div>
    </section>
  );
}
