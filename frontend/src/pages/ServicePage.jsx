import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { telegramClientApi } from '../api/telegramClientApi';

const humanStatus = {
  new: 'Новая',
  in_progress: 'В работе',
  waiting_client: 'Ожидает клиента',
  resolved: 'Решена',
  cancelled: 'Отменена',
};

const humanCategory = {
  coffee_machine: 'Кофемашина',
  grinder: 'Кофемолка',
  water: 'Фильтрация воды',
};

const errorLabels = {
  category_required: 'Выберите категорию заявки.',
  description_required: 'Добавьте описание проблемы.',
  urgency_required: 'Выберите срочность заявки.',
  equipment_not_found: 'Выбранное оборудование не найдено.',
  equipment_client_mismatch: 'Выбранное оборудование не принадлежит вашему профилю.',
  service_unavailable: 'Сервис временно недоступен. Попробуйте снова через минуту.',
  Invalid: 'Не удалось подтвердить Telegram-сессию. Перезапустите Mini App.',
  request_failed: 'Не удалось отправить заявку. Попробуйте еще раз.',
};

const formatError = (error) => {
  const message = String(error?.message || '').trim();
  if (!message) return 'Не удалось отправить заявку. Попробуйте позже.';

  const known = Object.entries(errorLabels).find(([code]) => message.includes(code));
  return known ? known[1] : message;
};

export function ServicePage() {
  const [equipment, setEquipment] = useState([]);
  const [history, setHistory] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState('');
  const [successRequest, setSuccessRequest] = useState(null);

  const [form, setForm] = useState({
    equipmentId: '',
    category: '',
    description: '',
    urgency: 'normal',
    canOperateNow: true,
    media: [],
  });

  const loadHistory = useCallback(async () => {
    const data = await telegramClientApi.listServiceRequests();
    setHistory(Array.isArray(data?.items) ? data.items : []);
  }, []);

  useEffect(() => {
    let active = true;

    Promise.all([
      telegramClientApi.listEquipment().catch(() => []),
      loadHistory().catch(() => {
        if (active) {
          setError('Не удалось загрузить историю заявок.');
        }
      }),
    ]).then(([equipmentItems]) => {
      if (!active) return;
      setEquipment(Array.isArray(equipmentItems?.items) ? equipmentItems.items : equipmentItems || []);
      setIsLoadingHistory(false);
    });

    return () => {
      active = false;
    };
  }, [loadHistory]);

  const selectedEquipment = useMemo(
    () => equipment.find((item) => item.id === form.equipmentId) || null,
    [equipment, form.equipmentId],
  );
  const hasEquipment = equipment.length > 0;

  const onSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError('');
    setSuccessRequest(null);
    setIsSubmitting(true);

    try {
      const payload = new FormData();

      if (form.equipmentId) {
        payload.append('equipmentId', form.equipmentId);
      }

      payload.append('category', form.category);
      payload.append('description', form.description.trim());
      payload.append('urgency', form.urgency);
      payload.append('canOperateNow', String(form.canOperateNow));

      form.media.forEach((file) => {
        payload.append('media', file);
      });

      const created = await telegramClientApi.createServiceRequest(payload);
      setSuccessRequest(created);

      setForm((prev) => ({ ...prev, category: '', description: '', media: [] }));
      await loadHistory();
    } catch (submitError) {
      setError(formatError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="service-page">
      <header className="hero service-hero">
        <h1>Сервис</h1>
        <p>Создайте заявку в пару шагов, а ниже отслеживайте все обращения и статусы работ.</p>
      </header>

      <div className="service-panel">
        <h2>Новая заявка</h2>

        {error ? <div className="notice notice-error">{error}</div> : null}
        {successRequest ? (
          <div className="notice notice-success">
            <strong>Заявка успешно отправлена.</strong>
            <p>ID: {successRequest.id}</p>
            <Link to={`/service/${successRequest.id}`}>Перейти к статусу заявки</Link>
          </div>
        ) : null}

        <form className="service-form" onSubmit={onSubmit}>
          {!hasEquipment ? (
            <div className="notice service-empty-equipment">
              <p><strong>У вас пока нет привязанного оборудования.</strong></p>
              <p>Вы все равно можете отправить заявку.</p>
            </div>
          ) : null}

          <label className="service-field-label" htmlFor="service-equipment-select">Оборудование (если известно)</label>
          <select
            id="service-equipment-select"
            value={form.equipmentId}
            aria-label="Оборудование (если известно)"
            onChange={(event) => setForm((prev) => ({ ...prev, equipmentId: event.target.value }))}
            disabled={isSubmitting}
          >
            <option value="">Не указывать оборудование</option>
            {equipment.map((item) => (
              <option key={item.id} value={item.id}>
                {item.brand} {item.model} ({item.internalNumber || item.id})
              </option>
            ))}
          </select>

          <select
            value={form.category}
            aria-label="Категория проблемы"
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            disabled={isSubmitting}
            required
          >
            <option value="" disabled>Категория проблемы</option>
            <option value="coffee_machine">Кофемашина</option>
            <option value="grinder">Кофемолка</option>
            <option value="water">Фильтрация воды</option>
          </select>

          <textarea
            placeholder="Описание проблемы"
            aria-label="Описание проблемы"
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            required
            disabled={isSubmitting}
          />

          <select
            value={form.urgency}
            aria-label="Приоритет заявки"
            onChange={(event) => setForm((prev) => ({ ...prev, urgency: event.target.value }))}
            disabled={isSubmitting}
          >
            <option value="low">Низкая</option>
            <option value="normal">Средняя</option>
            <option value="high">Высокая</option>
            <option value="critical">Критичная</option>
          </select>

          <label className="checkbox service-checkbox-card">
            <input
              type="checkbox"
              checked={form.canOperateNow}
              onChange={(event) => setForm((prev) => ({ ...prev, canOperateNow: event.target.checked }))}
              disabled={isSubmitting}
            />
            <span>Можно продолжать работать</span>
          </label>

          <label className="upload-block" htmlFor="service-attachments">
            <span className="upload-block__title">Фото или видео</span>
            <span className="upload-block__text">Приложите материал, чтобы инженер быстрее оценил ситуацию.</span>
            <input
              id="service-attachments"
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(event) => setForm((prev) => ({ ...prev, media: Array.from(event.target.files || []) }))}
              disabled={isSubmitting}
            />
            {form.media.length ? <small>Выбрано файлов: {form.media.length}</small> : null}
          </label>

          <button type="submit" className="service-submit-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Отправляем…' : 'Отправить заявку'}
          </button>
        </form>

        {selectedEquipment ? (
          <p className="service-hint">Выбрано оборудование: {selectedEquipment.brand} {selectedEquipment.model}</p>
        ) : null}
      </div>

      <section className="service-history">
        <h2>История заявок</h2>
        {isLoadingHistory ? <p>Загрузка…</p> : null}
        <div className="list">
          {history.map((request) => (
            <Link key={request.id} className="list-item" to={`/service/${request.id}`}>
              <strong>{request.id}</strong>
              <p>{humanCategory[request.category] || request.category}</p>
              <small>
                Статус: {humanStatus[request.status] || request.status} · {new Date(request.createdAt).toLocaleString('ru-RU')}
              </small>
            </Link>
          ))}
          {!history.length && !isLoadingHistory ? <p>Пока нет заявок.</p> : null}
        </div>
      </section>
    </section>
  );
}
