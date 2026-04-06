import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { telegramClientApi } from '../api/telegramClientApi';
import { useI18n } from '../i18n';

export function EquipmentPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const { t } = useI18n();

  useEffect(() => {
    telegramClientApi.listEquipment()
      .then((data) => setItems(Array.isArray(data?.items) ? data.items : []))
      .finally(() => setLoading(false));
    telegramClientApi.me()
      .then((data) => setProfile(data?.profile || null))
      .catch(() => setProfile(null));
  }, []);

  return (
    <section className="client-page">
      <header className="client-page__header">
        <div>
          <small>{t('linked_equipment')}</small>
          <h2>{t('my_equipment')}</h2>
          <p>{profile?.location?.name ? `${profile.location.name} · ${profile.network?.name || ''}` : t('equipment_empty_hint')}</p>
        </div>
      </header>
      {loading ? <p>{t('loading')}</p> : null}
      <div className="list client-equipment-grid">
        {items.map((item) => (
          <Link className="list-item client-equipment-card" key={item.id} to={`/equipment/${item.id}`}>
            <div className="client-equipment-card__head">
              <strong>{item.brand} {item.model}</strong>
              <span>{item.status || 'active'}</span>
            </div>
            <p>{t('serial_short')}: {item.serialNumber || '—'}</p>
            <p>{t('equipment_point')}: {item.locationName || item.clientLocation || item.address || '—'}</p>
            <small>{t('equipment_owner')}: {item.clientName || item.ownerType || '—'}</small>
          </Link>
        ))}
        {!loading && items.length === 0 ? <p className="empty-copy">{t('no_equipment')}</p> : null}
      </div>
    </section>
  );
}
