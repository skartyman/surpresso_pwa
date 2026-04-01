import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { mockApi } from '../api/mockApi';

export function ServicePage() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    mockApi.requestHistory().then(setHistory);
  }, []);

  return (
    <section>
      <h1>Сервис</h1>
      <form className="service-form">
        <select defaultValue="">
          <option value="" disabled>Категория проблемы</option>
          <option value="coffee_machine">Кофемашина</option>
          <option value="grinder">Кофемолка</option>
          <option value="water">Фильтрация воды</option>
        </select>
        <textarea placeholder="Описание проблемы" />
        <select defaultValue="normal">
          <option value="low">Низкая</option>
          <option value="normal">Средняя</option>
          <option value="high">Высокая</option>
          <option value="critical">Критичная</option>
        </select>
        <label className="checkbox">
          <input type="checkbox" defaultChecked /> Можно продолжать работать
        </label>
        <input type="file" accept="image/*,video/*" />
        <button type="button">Отправить заявку</button>
      </form>

      <h2>История заявок</h2>
      <div className="list">
        {history.map((request) => (
          <Link key={request.id} className="list-item" to={`/service/${request.id}`}>
            <strong>{request.id}</strong>
            <p>{request.description}</p>
            <small>Статус: {request.status}</small>
          </Link>
        ))}
      </div>
    </section>
  );
}
