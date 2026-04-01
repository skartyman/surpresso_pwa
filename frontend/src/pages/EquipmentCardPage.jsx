import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { mockApi } from '../api/mockApi';

export function EquipmentCardPage() {
  const { equipmentId } = useParams();
  const [item, setItem] = useState(null);

  useEffect(() => {
    mockApi.equipmentById(equipmentId).then(setItem);
  }, [equipmentId]);

  if (!item) return <p>Загрузка...</p>;

  return (
    <section>
      <h1>{item.model}</h1>
      <p>Серийный номер: {item.serialNumber}</p>
      <p>Внутренний номер: {item.internalNumber}</p>
      <p>Статус: {item.status}</p>
      <h3>История обслуживания</h3>
      <ul>
        {item.serviceHistory.map((event) => (
          <li key={event.id}>{event.date} — {event.action}</li>
        ))}
      </ul>
    </section>
  );
}
