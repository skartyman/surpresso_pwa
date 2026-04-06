import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { telegramClientApi } from '../api/telegramClientApi';
import { useI18n } from '../i18n';

export function EquipmentDetailPage() {
  const { equipmentId } = useParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    setLoading(true);
    telegramClientApi.equipmentById(equipmentId)
      .then(setItem)
      .finally(() => setLoading(false));
  }, [equipmentId]);

  if (loading) return <p>{t('loading')}</p>;
  if (!item) return <p>{t('err_request_failed')}</p>;

  return (
    <section className="status-card client-detail-card">
      <div className="client-detail-card__hero">
        <div>
          <small>{t('equipment_open_card')}</small>
          <h2>{item.brand} {item.model}</h2>
          <p>{item.id}</p>
        </div>
        <Link className="hero__link hero__link--primary" to={`/service?equipmentId=${encodeURIComponent(item.id)}`}>{t('equipment_create_request')}</Link>
      </div>
      <div className="client-detail-card__grid">
        <p>{t('serial_number')}: {item.serialNumber || '—'}</p>
        <p>{t('internal_number')}: {item.internalNumber || '—'}</p>
        <p>{t('status')}: {item.status || 'active'}</p>
        <p>{t('equipment_address')}: {item.address || item.locationName || item.clientLocation || '—'}</p>
      </div>
    </section>
  );
}
