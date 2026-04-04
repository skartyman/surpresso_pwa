import { useEffect, useMemo, useState } from 'react';
import { adminServiceApi } from '../api/adminServiceApi';
import { useAuth } from '../../auth/AuthContext';
import { ROLES } from '../roleConfig';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Все статусы' },
  { value: 'new', label: 'Новая' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'waiting_client', label: 'Ждёт клиента' },
  { value: 'waiting_parts', label: 'Ждёт запчасти' },
  { value: 'resolved', label: 'Решена' },
  { value: 'closed', label: 'Закрыта' },
  { value: 'overdue', label: 'Просрочена' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'Все типы' },
  { value: 'service_repair', label: 'Ремонт и сервис' },
  { value: 'coffee_order', label: 'Заказать кофе' },
  { value: 'coffee_tasting', label: 'Дегустация' },
  { value: 'grinder_check', label: 'Проверка помола' },
  { value: 'rental_auto', label: 'Аренда авто' },
  { value: 'rental_pro', label: 'Аренда проф.' },
  { value: 'feedback', label: 'Обратная связь' },
];

const SORT_OPTIONS = [
  { value: 'urgency', label: 'Срочность' },
  { value: 'createdAt', label: 'Время создания' },
  { value: 'updatedAt', label: 'Последнее обновление' },
];

const STATUS_LABELS = {
  new: 'Новая',
  in_progress: 'В работе',
  waiting_client: 'Ждёт клиента',
  waiting_parts: 'Ждёт запчасти',
  resolved: 'Решена',
  closed: 'Закрыта',
  overdue: 'Просрочена',
};

const STATUS_ICONS = {
  new: '🆕',
  in_progress: '🛠️',
  waiting_client: '💬',
  waiting_parts: '📦',
  resolved: '✅',
  closed: '📁',
  overdue: '⏰',
};

const VIEW_MODES = [
  { key: 'focus', label: 'Focus' },
  { key: 'board', label: 'Board' },
  { key: 'list', label: 'List' },
];

const BOARD_COLUMNS = [
  { key: 'new', title: 'Новые' },
  { key: 'in_progress', title: 'В работе' },
  { key: 'waiting_client', title: 'Ждут клиента' },
  { key: 'waiting_parts', title: 'Ждут запчасти' },
  { key: 'resolved', title: 'Решены' },
  { key: 'overdue', title: 'Просрочены' },
];

const KPI_META = {
  new: { icon: '🆕', tone: 'new' },
  in_progress: { icon: '🛠️', tone: 'in_progress' },
  overdue: { icon: '⏰', tone: 'overdue' },
  unassigned: { icon: '🚨', tone: 'critical' },
  waiting_parts: { icon: '📦', tone: 'warning' },
  closed_today: { icon: '✅', tone: 'resolved' },
  avg_reaction_hours: { icon: '⚡', tone: 'calm' },
  avg_close_hours: { icon: '📉', tone: 'neutral' },
};

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU');
}

function formatEquipmentLabel(request) {
  if (request?.equipment?.brand || request?.equipment?.model) {
    return `${request.equipment?.brand || ''} ${request.equipment?.model || ''}`.trim();
  }
  return 'Оборудование не выбрано';
}

function compactDuration(hours) {
  if (typeof hours !== 'number' || Number.isNaN(hours)) return '—';
  if (hours < 24) return `${hours.toFixed(1)} ч`;
  return `${(hours / 24).toFixed(1)} д`;
}

function getRequestHeat(request) {
  if (request?.urgency === 'critical') return 'critical';
  if (request?.status === 'overdue') return 'overdue';
  if (!request?.assignedToUserId) return 'danger';
  return 'normal';
}

function chartWidth(value, max) {
  if (!max) return '0%';
  return `${Math.max(8, Math.round((value / max) * 100))}%`;
}

function RequestCard({ request, active, onSelect }) {
  const media = request.media || [];
  const heat = getRequestHeat(request);

  return (
    <button type="button" className={`request-card ${active ? 'active' : ''}`} data-heat={heat} onClick={() => onSelect(request.id)}>
      <div className="request-card__strip" data-status={request.status} />
      <div className="request-card__row">
        <span className="admin-status-pill" data-status={request.status}>{STATUS_ICONS[request.status] || '📌'} {STATUS_LABELS[request.status] || request.status}</span>
        <span className="request-card__id">#{request.id}</span>
      </div>
      <strong>{request.client?.companyName || request.clientId}</strong>
      <span className="request-card__equipment">{formatEquipmentLabel(request)}</span>
      <div className="request-card__meta">
        <span>📂 {TYPE_OPTIONS.find((item) => item.value === request.type)?.label || request.type}</span>
        <span>🔥 {request.urgency || 'normal'}</span>
        <span>🕒 {formatDate(request.createdAt)}</span>
        <span>🔁 {formatDate(request.updatedAt)}</span>
        <span>👷 {request.assignedToUserId || 'Без назначения'}</span>
      </div>
      <div className="request-card__badges">
        {!request.assignedToUserId ? <em className="signal-chip signal-chip--danger">⚠️ Без назначения</em> : null}
        {!request.equipmentId ? <em className="signal-chip signal-chip--warning">🟠 Нет оборудования</em> : null}
        {request.urgency === 'critical' ? <em className="signal-chip signal-chip--critical">🚨 Критическая</em> : null}
      </div>
      <div className="request-card__icons">
        <span>🖼️ {media.filter((item) => item.kind === 'photo').length}</span>
        <span>🎥 {media.filter((item) => item.kind === 'video').length}</span>
        <span>💬 {request.commentCount || 0}</span>
        <span>🕓 {request.historyCount || 0}</span>
      </div>
    </button>
  );
}

export function AdminServicePage() {
  const { user } = useAuth();
  const isEngineer = user?.role === ROLES.serviceEngineer;
  const canSeeGlobal = user?.role === ROLES.serviceHead || user?.role === ROLES.owner || user?.role === ROLES.director || user?.role === ROLES.manager;

  const [viewMode, setViewMode] = useState('focus');
  const [filters, setFilters] = useState({
    status: 'all',
    type: 'all',
    id: '',
    client: '',
    equipment: '',
    engineer: 'all',
    sort: 'urgency',
  });
  const [requests, setRequests] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [history, setHistory] = useState([]);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [statusComment, setStatusComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [error, setError] = useState('');

  async function loadRequests(nextFilters = filters) {
    setLoading(true);
    setError('');
    try {
      const payload = await adminServiceApi.list({
        status: nextFilters.status === 'all' ? '' : nextFilters.status,
        type: nextFilters.type === 'all' ? '' : nextFilters.type,
        id: nextFilters.id,
        client: nextFilters.client,
        equipment: nextFilters.equipment,
        engineer: nextFilters.engineer === 'all' ? '' : nextFilters.engineer,
        sort: nextFilters.sort,
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

  async function loadDashboard(nextFilters = filters) {
    try {
      const payload = await adminServiceApi.dashboard({
        status: nextFilters.status === 'all' ? '' : nextFilters.status,
        type: nextFilters.type === 'all' ? '' : nextFilters.type,
        engineer: nextFilters.engineer === 'all' ? '' : nextFilters.engineer,
      });
      setDashboard(payload);
    } catch {
      setDashboard(null);
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
      setAssigneeUserId(requestPayload.request?.assignedToUserId || '');
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
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadDetails(selectedId);
  }, [selectedId]);

  const selectedStatus = useMemo(() => selectedRequest?.status || 'new', [selectedRequest]);
  const boardItems = useMemo(() => {
    const groups = Object.fromEntries(BOARD_COLUMNS.map((column) => [column.key, []]));
    requests.forEach((item) => {
      const key = groups[item.status] ? item.status : 'in_progress';
      groups[key].push(item);
    });
    return groups;
  }, [requests]);

  async function handleFilterChange(event) {
    const nextFilters = { ...filters, [event.target.name]: event.target.value };
    setFilters(nextFilters);
    setSelectedId(null);
    setSelectedRequest(null);
    await Promise.all([loadRequests(nextFilters), loadDashboard(nextFilters)]);
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
      await loadDashboard();
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleAddNote() {
    if (!selectedRequest || !newNote.trim()) return;
    setSavingNote(true);
    try {
      await adminServiceApi.addNote(selectedRequest.id, newNote.trim());
      setNewNote('');
      const notesPayload = await adminServiceApi.notes(selectedRequest.id);
      setNotes(notesPayload.notes || []);
      await loadDashboard();
    } finally {
      setSavingNote(false);
    }
  }

  async function handleAssignManager() {
    if (!selectedRequest) return;
    setAssigning(true);
    try {
      const payload = await adminServiceApi.assignManager(selectedRequest.id, assigneeUserId.trim());
      const updated = payload.request;
      setSelectedRequest(updated);
      setRequests((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      await loadDashboard();
    } finally {
      setAssigning(false);
    }
  }

  async function handleMarkWaitingParts() {
    if (!selectedRequest) return;
    setSavingNote(true);
    try {
      await adminServiceApi.addNote(selectedRequest.id, '[WAITING_PARTS] Ожидание запчастей');
      const notesPayload = await adminServiceApi.notes(selectedRequest.id);
      setNotes(notesPayload.notes || []);
      await loadDashboard();
    } finally {
      setSavingNote(false);
    }
  }

  async function handleCloseRequest() {
    if (!selectedRequest) return;
    setUpdatingStatus(true);
    try {
      const payload = await adminServiceApi.updateStatus(selectedRequest.id, 'closed', statusComment || 'Закрыто с панели быстрых действий');
      setSelectedRequest(payload.request);
      setRequests((prev) => prev.map((item) => (item.id === payload.request.id ? payload.request : item)));
      setStatusComment('');
      await loadDashboard();
    } finally {
      setUpdatingStatus(false);
    }
  }

  const title = isEngineer ? 'Service Ops · Мои заявки' : 'Service Ops Dashboard';

  return (
    <section className="admin-service-page admin-service-dashboard">
      <header className="admin-service-page__header service-dashboard-hero">
        <div>
          <h1>{title}</h1>
          <p>Живая операционная панель: срочное, риски, узкие места и текущая загрузка сервиса.</p>
        </div>
        <div className="view-mode-switch">
          {VIEW_MODES.map((item) => (
            <button key={item.key} type="button" className={viewMode === item.key ? 'active' : ''} onClick={() => setViewMode(item.key)}>{item.label}</button>
          ))}
        </div>
      </header>

      <section className="service-kpi-grid service-kpi-grid--modern">
        {(dashboard?.kpis || []).map((item) => {
          const meta = KPI_META[item.key] || { icon: '📊', tone: 'neutral' };
          return (
            <article key={item.key} className="service-kpi-card" data-tone={meta.tone}>
              <span>{meta.icon} {item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.deltaLabel || 'Оперативный контроль'}</small>
            </article>
          );
        })}
      </section>

      <article className="service-alert-rail">
        <h2>⚠️ Требует внимания</h2>
        <ul className="service-attention-list modern">
          {(dashboard?.attention || []).map((item) => (
            <li key={item.key} data-hot={item.value > 0 ? 'true' : 'false'}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </li>
          ))}
        </ul>
      </article>

      <div className="admin-filters-grid service-filters-grid service-filters-grid--modern">
        <label><span>Статус</span><select name="status" value={filters.status} onChange={handleFilterChange}>{STATUS_OPTIONS.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}</select></label>
        <label><span>Тип</span><select name="type" value={filters.type} onChange={handleFilterChange}>{TYPE_OPTIONS.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}</select></label>
        <label><span>Инженер</span><select name="engineer" value={filters.engineer} onChange={handleFilterChange}><option value="all">Все инженеры</option>{(dashboard?.engineers || []).map((eng) => (<option key={eng.userId} value={eng.userId}>{eng.name}</option>))}</select></label>
        <label><span>Поиск клиента</span><input name="client" value={filters.client} onChange={handleFilterChange} placeholder="🔍 Компания / контакт / телефон" /></label>
        <label><span>Оборудование</span><input name="equipment" value={filters.equipment} onChange={handleFilterChange} placeholder="Бренд / модель / serial" /></label>
        <label><span>ID заявки</span><input name="id" value={filters.id} onChange={handleFilterChange} placeholder="req-5001" /></label>
        <label><span>Сортировка</span><select name="sort" value={filters.sort} onChange={handleFilterChange}>{SORT_OPTIONS.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}</select></label>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {viewMode === 'board' ? (
        <section className="service-board-grid">
          {BOARD_COLUMNS.map((column) => (
            <article key={column.key} className="service-board-column">
              <h3>{column.title} <em>{boardItems[column.key]?.length || 0}</em></h3>
              <div className="service-board-column__list">
                {(boardItems[column.key] || []).map((request) => (
                  <RequestCard key={request.id} request={request} active={selectedId === request.id} onSelect={setSelectedId} />
                ))}
              </div>
            </article>
          ))}
        </section>
      ) : (
        <div className={`admin-service-grid ${viewMode === 'list' ? 'admin-service-grid--list' : ''}`}>
          <div className="admin-service-list modern">
            {loading ? <p>Загрузка...</p> : null}
            {!loading && requests.length === 0 ? <p>Заявки не найдены.</p> : null}
            {requests.map((request) => (
              <RequestCard key={request.id} request={request} active={selectedId === request.id} onSelect={setSelectedId} />
            ))}
          </div>

          {viewMode === 'focus' ? (
            <article className="admin-service-detail modern">
              {!selectedRequest ? <p>Выберите заявку для просмотра деталей.</p> : (
                <>
                  <header>
                    <div>
                      <h2>Заявка #{selectedRequest.id}</h2>
                      <p>{TYPE_OPTIONS.find((item) => item.value === selectedRequest.type)?.label || selectedRequest.type} · SLA {compactDuration(selectedRequest.slaHours || 0)}</p>
                    </div>
                    <div className="admin-status-pill" data-status={selectedRequest.status}>{STATUS_ICONS[selectedRequest.status] || '📌'} {STATUS_LABELS[selectedRequest.status] || selectedRequest.status}</div>
                  </header>

                  <section>
                    <h3>Обзор</h3>
                    <p>Срочность: <strong>{selectedRequest.urgency}</strong></p>
                    <p>Источник: {selectedRequest.source}</p>
                    <p>Контур: {selectedRequest.assignedDepartment}</p>
                    <p>Назначен: {selectedRequest.assignedToUserId || '—'}</p>
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
                      {selectedRequest.equipment ? (<><p>{selectedRequest.equipment?.brand} {selectedRequest.equipment?.model}</p><p>Серийный номер: {selectedRequest.equipment?.serial || '—'}</p><p>Внутренний №: {selectedRequest.equipment?.internalNumber || '—'}</p></>) : <p>Оборудование не привязано.</p>}
                    </section>
                  </div>

                  <section><h3>История</h3>{!history.length ? <p>История пока пустая.</p> : (<ul className="admin-history-list">{history.map((item) => (<li key={item.id}><strong>{STATUS_LABELS[item.previousStatus] || item.previousStatus} → {STATUS_LABELS[item.nextStatus] || item.nextStatus}</strong><span>{item.changedByRole || 'system'} · {item.changedByUserId || 'unknown'} · {formatDate(item.createdAt)}</span>{item.comment ? <p>{item.comment}</p> : null}</li>))}</ul>)}</section>

                  <section><h3>Медиа</h3>{selectedRequest.media?.length ? (<ul className="admin-media-list">{selectedRequest.media.map((media) => (<li key={media.id}><a href={media.fileUrl || media.url} target="_blank" rel="noreferrer">{media.originalName || media.fileUrl || media.url}</a></li>))}</ul>) : <p>Медиа не прикреплены.</p>}</section>

                  <section>
                    <h3>Комментарии и заметки</h3>
                    <div className="admin-notes-form"><textarea value={newNote} onChange={(event) => setNewNote(event.target.value)} placeholder="Добавить внутреннюю заметку" /><button type="button" onClick={handleAddNote} disabled={savingNote || !newNote.trim()}>Добавить заметку</button></div>
                    {!notes.length ? <p>Заметок пока нет.</p> : (<ul className="admin-history-list">{notes.map((item) => (<li key={item.id}><strong>{item.authorRole} · {item.authorId}</strong><span>{formatDate(item.createdAt)}</span><p>{item.text}</p></li>))}</ul>)}
                  </section>

                  <section>
                    <h3>Быстрые действия</h3>
                    <input value={assigneeUserId} onChange={(event) => setAssigneeUserId(event.target.value)} placeholder="Назначить инженера / менеджера (user id)" />
                    <div className="service-quick-actions">
                      <button type="button" onClick={handleAssignManager} disabled={assigning}>{assigning ? 'Сохраняем…' : 'Назначить инженера'}</button>
                      <select value={selectedStatus} onChange={handleStatusChange} disabled={updatingStatus}>{STATUS_OPTIONS.filter((item) => item.value !== 'all').map((item) => (<option key={item.value} value={item.value}>{item.label}</option>))}</select>
                      <button type="button" className="secondary" onClick={handleMarkWaitingParts} disabled={savingNote}>Отметить: ждёт запчасти</button>
                      <button type="button" onClick={handleCloseRequest} disabled={updatingStatus}>Закрыть заявку</button>
                    </div>
                    <textarea value={statusComment} onChange={(event) => setStatusComment(event.target.value)} placeholder="Комментарий к смене статуса" />
                  </section>
                </>
              )}
            </article>
          ) : null}
        </div>
      )}

      <section className="service-secondary-grid">
        <article className="admin-page modern-panel">
          <h2>Нагрузка инженеров</h2>
          <ul className="service-engineer-load modern">
            {(dashboard?.engineerLoad || []).map((item) => {
              const load = item.active + item.overdue * 1.5;
              const state = load >= 8 ? 'hot' : load >= 5 ? 'warm' : 'calm';
              return (
                <li key={item.userId} data-state={state}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>Активные: {item.active} · Просрочки: {item.overdue} · Критические: {item.critical || 0} · Закрыто сегодня: {item.closedToday}</span>
                    <div className="workload-meter"><i style={{ width: chartWidth(load, 10) }} /></div>
                  </div>
                  <em>{compactDuration(item.avgCloseHours)}</em>
                </li>
              );
            })}
          </ul>
        </article>

        <article className="admin-page modern-panel">
          <h2>Notification inbox</h2>
          <ul className="service-attention-list modern">
            {(dashboard?.attention || []).map((item) => (
              <li key={`inbox-${item.key}`} data-hot={item.value > 0 ? 'true' : 'false'}>
                <span>🔔 {item.label}</span>
                <strong>{item.value}</strong>
              </li>
            ))}
          </ul>
        </article>
      </section>

      {canSeeGlobal ? (
        <section className="service-analytics-grid">
          <article className="admin-page modern-panel"><h2>По статусам</h2><div className="analytics-bars">{(dashboard?.analytics?.statuses || []).map((item) => (<div key={item.key}><span>{item.label}</span><i style={{ width: chartWidth(item.value, Math.max(...(dashboard?.analytics?.statuses || []).map((s) => s.value), 1)) }} /><strong>{item.value}</strong></div>))}</div></article>
          <article className="admin-page modern-panel"><h2>По типам техники</h2><div className="analytics-bars">{(dashboard?.analytics?.equipmentTypes || []).map((item) => (<div key={item.key}><span>{item.label}</span><i style={{ width: chartWidth(item.value, Math.max(...(dashboard?.analytics?.equipmentTypes || []).map((s) => s.value), 1)) }} /><strong>{item.value}</strong></div>))}</div></article>
          <article className="admin-page modern-panel"><h2>По брендам</h2><div className="analytics-bars">{(dashboard?.analytics?.brands || []).map((item) => (<div key={item.key}><span>{item.label}</span><i style={{ width: chartWidth(item.value, Math.max(...(dashboard?.analytics?.brands || []).map((s) => s.value), 1)) }} /><strong>{item.value}</strong></div>))}</div></article>
          <article className="admin-page modern-panel"><h2>Динамика (14 дней)</h2><div className="analytics-bars">{(dashboard?.analytics?.daily || []).map((item) => (<div key={item.key}><span>{item.label}</span><i style={{ width: chartWidth(item.value, Math.max(...(dashboard?.analytics?.daily || []).map((s) => s.value), 1)) }} /><strong>{item.value}</strong></div>))}</div></article>
        </section>
      ) : null}
    </section>
  );
}
