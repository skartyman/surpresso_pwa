import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
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

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU');
}

function formatEquipmentLabel(request) {
  if (request?.equipment?.brand || request?.equipment?.model) {
    return `${request.equipment?.brand || ''} ${request.equipment?.model || ''}`.trim();
  }
  return 'Оборудование не указано';
}

export function AdminServicePage() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({ status: 'all', id: '', client: '', equipment: '' });
  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [history, setHistory] = useState([]);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [statusComment, setStatusComment] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [error, setError] = useState('');

  async function loadRequests(nextFilters = filters) {
    setLoading(true);
    setError('');
    try {
      const payload = await adminServiceApi.list({
        status: nextFilters.status === 'all' ? '' : nextFilters.status,
        id: nextFilters.id,
        client: nextFilters.client,
        equipment: nextFilters.equipment,
      });
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
      setHistory([]);
      setNotes([]);
      return;
    }

    try {
      const [requestPayload, historyPayload, notesPayload] = await Promise.all([
        adminServiceApi.byId(id),
        adminServiceApi.history(id),
        adminServiceApi.notes(id),
      ]);

      setSelectedRequest(requestPayload.request || null);
      setAssignedToUserId(requestPayload.request?.assignedToUserId || '');
      setHistory(historyPayload.history || []);
      setNotes(notesPayload.notes || []);
    } catch {
      setSelectedRequest(null);
      setHistory([]);
      setNotes([]);
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
    const nextFilters = { ...filters, [event.target.name]: event.target.value };
    setFilters(nextFilters);
    setSelectedId(null);
    setSelectedRequest(null);
    await loadRequests(nextFilters);
  }

  async function handleStatusChange(event) {
    if (!selectedRequest) return;

    const nextStatus = event.target.value;
    setUpdatingStatus(true);
    try {
      const payload = await adminServiceApi.updateStatus(selectedRequest.id, nextStatus, statusComment);
      const updated = payload.request;
      setSelectedRequest(updated);
      setRequests((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setStatusComment('');
      const historyPayload = await adminServiceApi.history(selectedRequest.id);
      setHistory(historyPayload.history || []);
    } finally {
      setUpdatingStatus(false);
    }
  }


  async function handleAssign() {
    if (!selectedRequest) return;
    await adminServiceApi.assign(selectedRequest.id, assignedToUserId);
    await loadDetails(selectedRequest.id);
    await loadRequests();
  }

  async function handleAddNote() {
    if (!selectedRequest || !newNote.trim()) return;
    setSavingNote(true);
    try {
      await adminServiceApi.addNote(selectedRequest.id, newNote.trim());
      setNewNote('');
      const notesPayload = await adminServiceApi.notes(selectedRequest.id);
      setNotes(notesPayload.notes || []);
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <section className="admin-service-page">
      <header className="admin-service-page__header">
        <h1>Сервисные заявки</h1>
      </header>

      <div className="admin-filters-grid">
        <label>
          <span>Статус</span>
          <select name="status" value={filters.status} onChange={handleFilterChange}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>ID заявки</span>
          <input name="id" value={filters.id} onChange={handleFilterChange} placeholder="req-5001" />
        </label>
        <label>
          <span>Клиент</span>
          <input name="client" value={filters.client} onChange={handleFilterChange} placeholder="Компания / контакт / телефон" />
        </label>
        <label>
          <span>Оборудование</span>
          <input name="equipment" value={filters.equipment} onChange={handleFilterChange} placeholder="Бренд / модель / serial" />
        </label>
      </div>

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
              <span>{formatEquipmentLabel(request)}</span>
              <small>{formatDate(request.updatedAt)}</small>
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

              <section>
                <h3>Карточка заявки</h3>
                <p>Категория: {selectedRequest.category}</p>
                <p>Срочность: {selectedRequest.urgency}</p>
                <p>Источник: {selectedRequest.source}</p>
                <p>Создана: {formatDate(selectedRequest.createdAt)}</p>
                <p>Обновлена: {formatDate(selectedRequest.updatedAt)}</p>
              </section>

              <div className="admin-detail-grid">
                <section>
                  <h3>Клиент</h3>
                  <p>{selectedRequest.client?.companyName || '—'}</p>
                  <p>{selectedRequest.client?.contactName || '—'}</p>
                  <p>{selectedRequest.client?.phone || '—'}</p>
                </section>
                <section>
                  <h3>Оборудование</h3>
                  {selectedRequest.equipment ? (
                    <>
                      <p>{selectedRequest.equipment?.brand} {selectedRequest.equipment?.model}</p>
                      <p>Серийный номер: {selectedRequest.equipment?.serial || '—'}</p>
                      <p>Внутренний №: {selectedRequest.equipment?.internalNumber || '—'}</p>
                    </>
                  ) : (
                    <>
                      <p>Оборудование не указано</p>
                      <p>Серийный номер: —</p>
                      <p>Внутренний №: —</p>
                      <button type="button" className="secondary" disabled title="Появится в следующих версиях">
                        Привязать оборудование (скоро)
                      </button>
                    </>
                  )}
                </section>
              </div>


              {['service_head', 'owner', 'director'].includes(user?.role) ? (
                <section>
                  <h3>Ответственный инженер</h3>
                  <input value={assignedToUserId} onChange={(event) => setAssignedToUserId(event.target.value)} placeholder="user-service-engineer-1" />
                  <button type="button" className="secondary" onClick={handleAssign}>Назначить</button>
                </section>
              ) : null}

              <section>
                <h3>Описание</h3>
                <p>{selectedRequest.description}</p>
              </section>

              <section>
                <h3>Изменение статуса</h3>
                <select value={selectedStatus} onChange={handleStatusChange} disabled={updatingStatus}>
                  {STATUS_OPTIONS.filter((item) => item.value !== 'all').map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
                <textarea
                  value={statusComment}
                  onChange={(event) => setStatusComment(event.target.value)}
                  placeholder="Комментарий к смене статуса (необязательно)"
                />
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
                <h3>История статусов</h3>
                {!history.length ? <p>История пока пустая.</p> : (
                  <ul className="admin-history-list">
                    {history.map((item) => (
                      <li key={item.id}>
                        <strong>{STATUS_LABELS[item.previousStatus] || item.previousStatus} → {STATUS_LABELS[item.nextStatus] || item.nextStatus}</strong>
                        <span>{item.changedByRole || 'system'} · {item.changedByUserId || 'unknown'} · {formatDate(item.createdAt)}</span>
                        {item.comment ? <p>{item.comment}</p> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3>Internal notes</h3>
                <div className="admin-notes-form">
                  <textarea
                    value={newNote}
                    onChange={(event) => setNewNote(event.target.value)}
                    placeholder="Добавить внутреннюю заметку"
                  />
                  <button type="button" onClick={handleAddNote} disabled={savingNote || !newNote.trim()}>Добавить заметку</button>
                </div>
                {!notes.length ? <p>Заметок пока нет.</p> : (
                  <ul className="admin-history-list">
                    {notes.map((item) => (
                      <li key={item.id}>
                        <strong>{item.authorRole} · {item.authorId}</strong>
                        <span>{formatDate(item.createdAt)}</span>
                        <p>{item.text}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </article>
      </div>
    </section>
  );
}
