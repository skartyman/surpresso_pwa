import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { mockApi } from '../api/mockApi';

export function ServicePage() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    mockApi.requestHistory().then(setHistory);
  }, []);

  return (
    <section className="service-page">
      <header className="hero service-hero">
        <h1>Сервис</h1>
        <p>Создайте заявку в пару шагов, а ниже отслеживайте все обращения и статусы работ.</p>
      </header>

      <div className="service-panel">
        <h2>Новая заявка</h2>
        <form className="service-form">
          <select defaultValue="" aria-label="Категория проблемы">
            <option value="" disabled>Категория проблемы</option>
            <option value="coffee_machine">Кофемашина</option>
            <option value="grinder">Кофемолка</option>
            <option value="water">Фильтрация воды</option>
          </select>

          <textarea placeholder="Описание проблемы" aria-label="Описание проблемы" />

          <select defaultValue="normal" aria-label="Приоритет заявки">
            <option value="low">Низкая</option>
            <option value="normal">Средняя</option>
            <option value="high">Высокая</option>
            <option value="critical">Критичная</option>
          </select>

          <label className="checkbox service-checkbox-card">
            <input type="checkbox" defaultChecked />
            <span>Можно продолжать работать</span>
          </label>

          <label className="upload-block" htmlFor="service-attachments">
            <span className="upload-block__title">Фото или видео</span>
            <span className="upload-block__text">Приложите материал, чтобы инженер быстрее оценил ситуацию.</span>
            <input id="service-attachments" type="file" accept="image/*,video/*" />
          </label>

          <button type="button" className="service-submit-btn">Отправить заявку</button>
        </form>
      </div>

      <section className="service-history">
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
    </section>
  );
}
