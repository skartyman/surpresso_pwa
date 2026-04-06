import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { telegramClientApi } from '../api/telegramClientApi';
import { useI18n } from '../i18n';

export function EquipmentPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    telegramClientApi.listEquipment()
      .then((data) => setItems(Array.isArray(data?.items) ? data.items : []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section>
      <h2>{t('my_equipment')}</h2>
      {loading ? <p>{t('loading')}</p> : null}
      <div className="list">
        {items.map((item) => (
          <Link className="list-item" key={item.id} to={`/equipment/${item.id}`}>
            <strong>{item.brand} {item.model}</strong>
            <p>{t('serial_short')}: {item.serialNumber || '—'}</p>
            <small>{t('status')}: {item.status || 'active'}</small>
          </Link>
        ))}
        {!loading && items.length === 0 ? <p>{t('no_equipment')}</p> : null}
      </div>
    </section>
  );
}
