import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { mockApi } from '../api/mockApi';

export function EquipmentPage() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    mockApi.equipmentList().then(setItems);
  }, []);

  return (
    <section>
      <h1>Мое оборудование</h1>
      <div className="list">
        {items.map((item) => (
          <Link className="list-item" key={item.id} to={`/equipment/${item.id}`}>
            <strong>{item.model}</strong>
            <p>Серийный № {item.serialNumber}</p>
            <small>Статус: {item.status}</small>
          </Link>
        ))}
      </div>
    </section>
  );
}
