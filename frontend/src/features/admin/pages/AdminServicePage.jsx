import { useEffect, useMemo, useState } from 'react';
import { adminServiceApi } from '../api/adminServiceApi';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'new', label: 'Новая' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'resolved', label: 'Решена' },
  { value: 'closed', label: 'Закрыта' },
];

const STATUS_LABELS = {
  new: 'Новая',
  in_progress: 'В работе',
  resolved: 'Решена',
  closed: 'Закрыта',
};

export function AdminServicePage() {
  const [status, setStatus] = useState('all');
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState('');

  async function loadRequests(nextStatus = status) {
    setLoading(true);
    setError('');
    try {
      const payload = await adminServiceApi.list({ status: nextStatus === 'all' ? '' : nextStatus });
      setRequests(payload.requests || []);
      if (!selectedId && payload.requests?.[0]?.id) {
        setSelectedId(payload.requests[0].id);
      }
    } catch (err) {
      setError(err?.status === 403 ? 'Нет доступа к модулю сервиса.' : 'Не удалось загрузить список заявок.');
    } finally {
      setLoading(false);
    }
  }

  async function loadDetails(id) {
    if (!id) {
      setSelectedRequest(null);
      return;
    }

    try {
      const payload = await adminServiceApi.byId(id);
      setSelectedRequest(payload.request || null);
    } catch {
      setSelectedRequest(null);
    }
  }

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadDetails(selectedId);
  }, [selectedId]);

  const selectedStatus = useMemo(() => selectedRequest?.status || 'new', [selectedRequest]);

  async function handleFilterChange(event) {
    const next = event.target.value;
    setStatus(next);
    setSelectedId(null);
    setSelectedRequest(null);
    await loadRequests(next);
  }

  async function handleStatusChange(event) {
    if (!selectedRequest) return;

    const nextStatus = event.target.value;
    setUpdatingStatus(true);
    try {
      const payload = await adminServiceApi.updateStatus(selectedRequest.id, nextStatus);
      const updated = payload.request;
      setSelectedRequest(updated);
      setRequests((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <section className="admin-service-page">
      <header className="admin-service-page__header">
        <h1>Сервисные заявки</h1>
        <label>
          <span>Фильтр по статусу</span>
          <select value={status} onChange={handleFilterChange}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="admin-service-grid">
        <div className="admin-service-list">
          {loading ? <p>Загрузка...</p> : null}
          {!loading && requests.length === 0 ? <p>Заявки не найдены.</p> : null}
          {requests.map((request) => (
            <button
              key={request.id}
              type="button"
              className={`admin-service-list__item ${selectedId === request.id ? 'active' : ''}`}
              onClick={() => setSelectedId(request.id)}
            >
              <div className="admin-status-pill" data-status={request.status}>{STATUS_LABELS[request.status] || request.status}</div>
              <strong>{request.client?.companyName || request.clientId}</strong>
              <span>{request.equipment?.brand} {request.equipment?.model}</span>
              <small>{new Date(request.updatedAt).toLocaleString('ru-RU')}</small>
            </button>
          ))}
        </div>

        <article className="admin-service-detail">
          {!selectedRequest ? <p>Выберите заявку для просмотра деталей.</p> : (
            <>
              <header>
                <h2>Заявка #{selectedRequest.id}</h2>
                <div className="admin-status-pill" data-status={selectedRequest.status}>{STATUS_LABELS[selectedRequest.status] || selectedRequest.status}</div>
              </header>

              <div className="admin-detail-grid">
                <section>
                  <h3>Клиент</h3>
                  <p>{selectedRequest.client?.companyName}</p>
                  <p>{selectedRequest.client?.contactName}</p>
                  <p>{selectedRequest.client?.phone}</p>
                </section>
                <section>
                  <h3>Оборудование</h3>
                  <p>{selectedRequest.equipment?.brand} {selectedRequest.equipment?.model}</p>
                  <p>Серийный номер: {selectedRequest.equipment?.serial}</p>
                  <p>Внутренний №: {selectedRequest.equipment?.internalNumber}</p>
                </section>
              </div>

              <section>
                <h3>Описание</h3>
                <p>{selectedRequest.description}</p>
                <p>Создана: {new Date(selectedRequest.createdAt).toLocaleString('ru-RU')}</p>
                <p>Обновлена: {new Date(selectedRequest.updatedAt).toLocaleString('ru-RU')}</p>
              </section>

              <section>
                <h3>Изменение статуса</h3>
                <select value={selectedStatus} onChange={handleStatusChange} disabled={updatingStatus}>
                  {STATUS_OPTIONS.filter((item) => item.value !== 'all').map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </section>

              <section>
                <h3>Медиа</h3>
                {selectedRequest.media?.length ? (
                  <ul className="admin-media-list">
                    {selectedRequest.media.map((media) => (
                      <li key={media.id}><a href={media.url} target="_blank" rel="noreferrer">{media.type}: {media.url}</a></li>
                    ))}
                  </ul>
                ) : <p>Медиа не прикреплены.</p>}
              </section>

              <section>
                <h3>Комментарии / Notes</h3>
                <div className="admin-notes-placeholder">
                  <p>Структура для следующего этапа:</p>
                  <ul>
                    <li>authorId</li>
                    <li>authorRole</li>
                    <li>text</li>
                    <li>createdAt</li>
                    <li>visibility (internal/client)</li>
                  </ul>
                </div>
              </section>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
