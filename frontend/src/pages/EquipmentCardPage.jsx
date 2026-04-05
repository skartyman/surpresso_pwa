import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { mockApi } from '../api/mockApi';
import { useI18n } from '../i18n';

export function EquipmentCardPage() {
  const { equipmentId } = useParams();
  const [item, setItem] = useState(null);
  const { t } = useI18n();

  useEffect(() => {
    mockApi.equipmentById(equipmentId).then(setItem);
  }, [equipmentId]);

  if (!item) return <p>{t('loading')}</p>;

  return (
    <section>
      <h1>{item.model}</h1>
      <p>{t('serial_number')}: {item.serialNumber}</p>
      <p>{t('internal_number')}: {item.internalNumber}</p>
      <p>{t('status')}: {item.status}</p>
      <h3>{t('service_history')}</h3>
      <ul>
        {item.serviceHistory.map((event) => (
          <li key={event.id}>{event.date} — {event.action}</li>
        ))}
      </ul>
    </section>
  );
}
