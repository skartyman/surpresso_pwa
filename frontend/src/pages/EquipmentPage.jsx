import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { mockApi } from '../api/mockApi';
import { useI18n } from '../i18n';

export function EquipmentPage() {
  const [items, setItems] = useState([]);
  const { t } = useI18n();

  useEffect(() => {
    mockApi.equipmentList().then(setItems);
  }, []);

  return (
    <section>
      <h1>{t('my_equipment')}</h1>
      <div className="list">
        {items.map((item) => (
          <Link className="list-item" key={item.id} to={`/equipment/${item.id}`}>
            <strong>{item.model}</strong>
            <p>{t('serial_short')} {item.serialNumber}</p>
            <small>{t('status')}: {item.status}</small>
          </Link>
        ))}
      </div>
    </section>
  );
}
