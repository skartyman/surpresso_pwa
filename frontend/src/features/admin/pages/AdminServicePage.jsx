import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { adminServiceApi } from '../api/adminServiceApi';
import { ROLES } from '../roleConfig';
import {
  ActionRail,
  ActionRailButton,
  AlertPanel,
  DetailPanel,
  FilterRow,
  Icon,
  KPIChipCard,
  StatusBadge,
} from '../components/AdminUi';

const BOARD_COLUMNS = ['new', 'assigned', 'taken_in_work', 'ready_for_qc', 'on_service_head_control', 'to_director', 'invoiced'];
const BOARD_LABELS = {
  new: 'Новая заявка',
  assigned: 'Назначена',
  taken_in_work: 'В работе',
  ready_for_qc: 'Готово к QC',
  on_service_head_control: 'Контроль начсервиса',
  to_director: 'Директор / счет',
  invoiced: 'Счет выставлен',
  closed: 'Закрыта',
  cancelled: 'Отменена',
};
const COLUMN_THEME = {
  new: { eyebrow: 'Входящий поток', accent: 'blue' },
  assigned: { eyebrow: 'Назначение', accent: 'violet' },
  taken_in_work: { eyebrow: 'Инженер', accent: 'orange' },
  ready_for_qc: { eyebrow: 'Проверка', accent: 'teal' },
  on_service_head_control: { eyebrow: 'Начсервиса', accent: 'green' },
  to_director: { eyebrow: 'Финализация', accent: 'yellow' },
  invoiced: { eyebrow: 'Документы', accent: 'rose' },
};
const DETAIL_TABS = ['overview', 'history', 'media', 'notes'];
const TAB_LABELS = { overview: 'Обзор', history: 'История', media: 'Фото / видео', notes: 'Заметки' };

function formatDate(value) {
  return value ? new Date(value).toLocaleString('ru-RU') : '—';
}

function getRequestPreview(request) {
  return (request?.media || []).find((item) => item.previewUrl || item.fileUrl) || null;
}

function splitMediaByStage(rows = []) {
  const grouped = { before: [], after: [], client: [] };
  rows.forEach((item) => {
    const stage = item.stage || 'client';
    if (!grouped[stage]) grouped[stage] = [];
    grouped[stage].push(item);
  });
  return grouped;
}

function getRoleActions(request, user) {
  const status = request?.status;
  const isEngineer = user?.role === ROLES.serviceEngineer;
  const isHead = [ROLES.serviceHead, ROLES.manager, ROLES.owner].includes(user?.role);
  const isDirector = [ROLES.director, ROLES.owner].includes(user?.role);
  const isBilling = [ROLES.salesManager, ROLES.director, ROLES.owner].includes(user?.role);
  const actions = [];

  if (isEngineer && !request?.assignedToUserId && ['new', 'assigned'].includes(status)) {
    actions.push({ kind: 'claim', label: 'Взять в работу' });
  }
  if (isEngineer && request?.assignedToUserId === user?.id && status === 'assigned') {
    actions.push({ kind: 'status', status: 'taken_in_work', label: 'Начать работу' });
  }
  if (isEngineer && request?.assignedToUserId === user?.id && status === 'taken_in_work') {
    actions.push({ kind: 'status', status: 'ready_for_qc', label: 'Передать на QC' });
  }
  if (isHead && status === 'ready_for_qc') {
    actions.push({ kind: 'status', status: 'on_service_head_control', label: 'Взять на контроль' });
  }
  if (isHead && status === 'on_service_head_control') {
    actions.push({ kind: 'status', status: 'to_director', label: 'Передать директору' });
  }
  if (isDirector && status === 'to_director') {
    actions.push({ kind: 'status', status: 'invoiced', label: 'На выставление счета' });
  }
  if (isBilling && status === 'invoiced') {
    actions.push({ kind: 'status', status: 'closed', label: 'Закрыть заявку' });
  }
  return actions;
}

function ServiceQuickActions({ actions, loadingKey, onAction }) {
  if (!actions.length) return null;
  return (
    <ActionRail compact className="service-board-card__actions">
      {actions.map((action) => (
        <ActionRailButton
          key={`${action.kind}:${action.status || action.label}`}
          className={`service-board-card__action ${action.kind === 'claim' ? '' : 'secondary'}`}
          tone={action.kind === 'claim' ? 'brand' : 'default'}
          disabled={Boolean(loadingKey)}
          onClick={(event) => {
            event.stopPropagation();
            onAction(action);
          }}
        >
          {loadingKey === `${action.kind}:${action.status || 'claim'}` ? '...' : action.label}
        </ActionRailButton>
      ))}
    </ActionRail>
  );
}

function ServiceTicketCard({ request, active, user, actionLoading, onSelect, onAction }) {
  const preview = getRequestPreview(request);
  const actions = getRoleActions(request, user);
  const warnings = [];
  if (!request.assignedToUserId) warnings.push('Без инженера');
  if (!request.equipmentId) warnings.push('Без оборудования');
  if (request.status === 'taken_in_work' && (request.media || []).filter((item) => item.stage === 'after').length === 0) warnings.push('Нет фото после');

  return (
    <article className={`service-board-card ${active ? 'active' : ''}`} data-status={request.status}>
      <button type="button" className="service-board-card__body" onClick={() => onSelect(request.id)}>
        <div className="service-board-card__topbar">
          <StatusBadge status={request.status}>{BOARD_LABELS[request.status] || request.status}</StatusBadge>
          <small>#{request.id}</small>
        </div>

        <div className="service-board-card__preview">
          {preview?.previewUrl || preview?.fileUrl
            ? <img src={preview.previewUrl || preview.fileUrl} alt={request.equipment?.model || 'preview'} loading="lazy" />
            : <div className="service-board-card__preview-empty"><Icon name="equipment" /><span>Нет фото</span></div>}
        </div>

        <div className="service-board-card__content">
          <strong>{request.pointUser?.fullName || request.client?.contactName || request.client?.companyName || 'Клиент'}</strong>
          <p>{request.equipment?.brand || '—'} {request.equipment?.model || ''}</p>
          <p>{request.location?.name || request.equipment?.locationName || 'Точка не выбрана'}</p>
          <p>{request.description || 'Без описания'}</p>
        </div>

        {warnings.length ? (
          <div className="warning-badges service-board-card__warnings">
            {warnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        ) : null}

        <div className="service-board-card__meta">
          <span><Icon name="employees" /> {request.assignedToUser?.fullName || 'Не назначен'}</span>
          <span><Icon name="clients" /> {request.client?.companyName || '—'}</span>
          <span><Icon name="service" /> {request.urgency || 'normal'}</span>
          <span><Icon name="equipment" /> {(request.media || []).length}</span>
        </div>

        <div className="service-board-card__footer">
          <div className="service-board-card__facts">
            <span><Icon name="dashboard" /> {(request.history || []).length}</span>
            <span><Icon name="content" /> {(request.notes || []).length}</span>
            <span><Icon name="service" /> {request.category || 'service'}</span>
          </div>
          <small>{formatDate(request.updatedAt)}</small>
        </div>
      </button>

      <ServiceQuickActions actions={actions} loadingKey={actionLoading} onAction={onAction} />
    </article>
  );
}

export function AdminServicePage() {
  const { user } = useAuth();
  const canAssign = [ROLES.serviceHead, ROLES.manager, ROLES.owner].includes(user?.role);
  const canSeeInternalNotes = [ROLES.serviceEngineer, ROLES.serviceHead, ROLES.manager, ROLES.director, ROLES.owner].includes(user?.role);

  const [filters, setFilters] = useState({ engineer: 'all', quickFilter: 'all', status: 'all', id: '', client: '' });
  const [requests, setRequests] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [engineers, setEngineers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [assignmentHistory, setAssignmentHistory] = useState([]);
  const [assignForm, setAssignForm] = useState({ assignedToUserId: '' });
  const [activeTab, setActiveTab] = useState('overview');
  const [noteBody, setNoteBody] = useState('');
  const [mediaFiles, setMediaFiles] = useState([]);
  const [mediaStage, setMediaStage] = useState('before');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  async function load(next = filters) {
    setLoading(true);
    try {
      const [list, dash, engineerPayload] = await Promise.all([
        adminServiceApi.list({
          status: next.status === 'all' ? '' : next.status,
          client: next.client,
          id: next.id,
          engineer: next.engineer === 'all' ? '' : next.engineer,
          sort: 'updatedAt',
        }),
        adminServiceApi.dashboard({
          status: next.status === 'all' ? '' : next.status,
          engineer: next.engineer === 'all' ? '' : next.engineer,
        }),
        adminServiceApi.serviceEngineers().catch(() => ({ engineers: [] })),
      ]);

      const rows = list.requests || [];
      setRequests(rows);
      setDashboard(dash || null);
      setEngineers(engineerPayload.engineers || []);
      setSelectedId((prev) => prev || rows[0]?.id || null);
      setError('');
    } catch {
      setError('Не удалось загрузить сервисные заявки.');
    } finally {
      setLoading(false);
    }
  }

  async function loadDetails(id) {
    const [payload, history] = await Promise.all([
      adminServiceApi.byId(id),
      adminServiceApi.assignmentHistory(id).catch(() => ({ history: [] })),
    ]);
    setSelectedRequest(payload.request || null);
    setAssignmentHistory(history.history || []);
    setAssignForm({ assignedToUserId: payload.request?.assignedToUserId || '' });
  }

  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => {
    if (!selectedId) return;
    loadDetails(selectedId).catch(() => {
      setSelectedRequest(null);
      setAssignmentHistory([]);
    });
  }, [selectedId]);

  async function runAction(action, request = selectedRequest) {
    if (!request) return;
    const busyKey = `${action.kind}:${action.status || 'claim'}`;
    setActionLoading(busyKey);
    setError('');
    try {
      if (action.kind === 'claim') {
        await adminServiceApi.assignManager(request.id, user.id, 'Engineer self-claimed request');
        await adminServiceApi.updateStatus(request.id, 'taken_in_work', 'Engineer started work');
      } else {
        await adminServiceApi.updateStatus(request.id, action.status, action.label);
      }
      await load();
      await loadDetails(request.id);
      setFeedback(action.label);
    } catch (actionError) {
      setError(actionError?.message || 'Не удалось выполнить действие.');
    } finally {
      setActionLoading('');
    }
  }

  async function submitAssignment() {
    if (!selectedId || !assignForm.assignedToUserId) return;
    setActionLoading('assign');
    setError('');
    try {
      await adminServiceApi.assignManager(selectedId, assignForm.assignedToUserId, 'Assigned from service board');
      await load();
      await loadDetails(selectedId);
      setFeedback('Инженер назначен.');
    } catch (assignError) {
      setError(assignError?.message || 'Не удалось назначить инженера.');
    } finally {
      setActionLoading('');
    }
  }

  async function submitNote() {
    if (!selectedId || !noteBody.trim()) return;
    setActionLoading('note');
    setError('');
    try {
      await adminServiceApi.addNote(selectedId, noteBody.trim());
      setNoteBody('');
      await loadDetails(selectedId);
      setFeedback('Заметка добавлена.');
    } catch (noteError) {
      setError(noteError?.message || 'Не удалось сохранить заметку.');
    } finally {
      setActionLoading('');
    }
  }

  async function submitMedia() {
    if (!selectedId || !mediaFiles.length) return;
    setActionLoading('media');
    setError('');
    try {
      await adminServiceApi.uploadRequestMedia(selectedId, mediaFiles, mediaStage);
      setMediaFiles([]);
      await load();
      await loadDetails(selectedId);
      setFeedback(mediaStage === 'after' ? 'Фото после загружены.' : 'Фото до загружены.');
    } catch (mediaError) {
      setError(mediaError?.message || 'Не удалось загрузить медиа.');
    } finally {
      setActionLoading('');
    }
  }

  const filteredRequests = useMemo(() => requests.filter((item) => {
    if (filters.quickFilter === 'unassigned') return !item.assignedToUserId;
    if (filters.quickFilter === 'mine') return item.assignedToUserId === user?.id;
    if (filters.quickFilter === 'critical') return item.urgency === 'critical';
    if (filters.quickFilter === 'with_qc') return ['ready_for_qc', 'on_service_head_control'].includes(item.status);
    return true;
  }), [filters.quickFilter, requests, user?.id]);

  const boardColumns = useMemo(() => BOARD_COLUMNS.map((status) => ({
    status,
    label: BOARD_LABELS[status],
    items: filteredRequests.filter((item) => item.status === status),
  })), [filteredRequests]);

  const kpis = dashboard?.kpis || [];
  const attention = dashboard?.attention || [];
  const mediaGroups = splitMediaByStage(selectedRequest?.media || []);
  const quickFilters = [
    { key: 'all', label: 'Все' },
    { key: 'unassigned', label: 'Без назначения' },
    { key: 'mine', label: 'Мои' },
    { key: 'critical', label: 'Критические' },
    { key: 'with_qc', label: 'QC / контроль' },
  ];
  const statusOptions = [...BOARD_COLUMNS, 'closed', 'cancelled'];

  return (
    <section className="service-dashboard">
      <header className="service-command">
        <div className="service-command__copy">
          <small>Service board</small>
          <h2>Сервисные заявки</h2>
          <p>Редакционный kanban по заявкам: входящий поток, инженерная работа, QC и финализация без перегруженных панелей.</p>
        </div>
        <div className="service-command__stats">
          {(kpis || []).slice(0, 4).map((item) => (
            <KPIChipCard key={item.key} label={item.label} value={item.value} icon="service" tone={item.key} hint="workflow" />
          ))}
        </div>
      </header>

      <AlertPanel items={attention.map((item) => <li key={item.key}><span>{item.label}</span><strong>{item.value}</strong></li>)} />

      <div className="service-filter-shell">
        <ActionRail compact className="service-filter-shell__chips">
          {quickFilters.map((item) => (
            <ActionRailButton
              key={item.key}
              active={filters.quickFilter === item.key}
              tone={filters.quickFilter === item.key ? 'brand' : 'default'}
              onClick={() => setFilters((prev) => ({ ...prev, quickFilter: item.key }))}
            >
              {item.label}
            </ActionRailButton>
          ))}
        </ActionRail>

        <FilterRow>
          <label><span>Инженер</span><select value={filters.engineer} onChange={(e) => { const next = { ...filters, engineer: e.target.value }; setFilters(next); load(next); }}><option value="all">Все инженеры</option>{engineers.map((eng) => <option key={eng.id} value={eng.id}>{eng.fullName}</option>)}</select></label>
          <label><span>Статус</span><select value={filters.status} onChange={(e) => { const next = { ...filters, status: e.target.value }; setFilters(next); load(next); }}><option value="all">Все</option>{statusOptions.map((status) => <option key={status} value={status}>{BOARD_LABELS[status]}</option>)}</select></label>
          <label><span>ID</span><input value={filters.id} onChange={(e) => setFilters((prev) => ({ ...prev, id: e.target.value }))} onBlur={() => load(filters)} placeholder="req-..." /></label>
          <label><span>Клиент</span><input value={filters.client} onChange={(e) => setFilters((prev) => ({ ...prev, client: e.target.value }))} onBlur={() => load(filters)} placeholder="поиск" /></label>
        </FilterRow>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {feedback ? <p>{feedback}</p> : null}

      <div className="service-workspace kanban-layout">
        <div className="kanban-board">
          {loading ? <p>Загрузка...</p> : null}
          {boardColumns.map((column) => (
            <section key={column.status} className="service-board-column-trello" data-accent={COLUMN_THEME[column.status]?.accent || 'blue'}>
              <header className="service-board-column-trello__header">
                <div>
                  <small>{COLUMN_THEME[column.status]?.eyebrow || 'Колонка'}</small>
                  <h4>{column.label}</h4>
                </div>
                <strong>{column.items.length}</strong>
              </header>
              <div className="service-board-column-trello__list">
                {column.items.map((request) => (
                  <ServiceTicketCard
                    key={request.id}
                    request={request}
                    active={selectedId === request.id}
                    user={user}
                    actionLoading={actionLoading}
                    onSelect={setSelectedId}
                    onAction={(action) => runAction(action, request)}
                  />
                ))}
                {!column.items.length ? <p className="empty-copy">Пусто</p> : null}
              </div>
            </section>
          ))}
        </div>

        <DetailPanel>
          {!selectedRequest ? <p>Выберите заявку на доске.</p> : (
            <>
              <header className="detail-header"><h3>Заявка #{selectedRequest.id}</h3><StatusBadge status={selectedRequest.status}>{BOARD_LABELS[selectedRequest.status] || selectedRequest.status}</StatusBadge></header>
              <ActionRail className="detail-toolbar">
                <ActionRailButton tone="brand" onClick={() => setActiveTab('overview')}>Обзор</ActionRailButton>
                <ActionRailButton onClick={() => setActiveTab('media')}>Фото / видео</ActionRailButton>
                <ActionRailButton onClick={() => setActiveTab('history')}>История</ActionRailButton>
                <ActionRailButton onClick={() => setActiveTab('notes')}>Заметки</ActionRailButton>
              </ActionRail>
              <nav className="detail-tabs">
                {DETAIL_TABS.map((tab) => <button key={tab} type="button" className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{TAB_LABELS[tab]}</button>)}
              </nav>

              {activeTab === 'overview' ? (
                <>
                  <section className="detail-hero">
                    <div className="detail-hero__copy">
                      <div className="detail-hero__eyebrow">
                        <small>Service request</small>
                        <strong>{selectedRequest.client?.companyName || selectedRequest.pointUser?.fullName || 'Клиент'}</strong>
                      </div>
                      <div className="detail-grid">
                        <p><Icon name="clients" /> Клиент: {selectedRequest.client?.companyName || '—'}</p>
                        <p><Icon name="employees" /> Бариста: {selectedRequest.pointUser?.fullName || '—'}</p>
                        <p><Icon name="equipment" /> Оборудование: {selectedRequest.equipment?.brand || '—'} {selectedRequest.equipment?.model || ''}</p>
                        <p><Icon name="equipment" /> Точка: {selectedRequest.location?.name || selectedRequest.equipment?.locationName || '—'}</p>
                        <p><Icon name="service" /> Срочность: {selectedRequest.urgency || 'normal'}</p>
                        <p><Icon name="dashboard" /> Назначен: {selectedRequest.assignedToUser?.fullName || 'Не назначен'}</p>
                        <p><Icon name="content" /> Может работать: {selectedRequest.canOperateNow ? 'Да' : 'Нет'}</p>
                        <p><Icon name="clients" /> Обновлено: {formatDate(selectedRequest.updatedAt)}</p>
                      </div>
                    </div>
                    <div className="detail-hero__preview">
                      {getRequestPreview(selectedRequest)?.previewUrl || getRequestPreview(selectedRequest)?.fileUrl
                        ? <img className="ticket-preview" src={getRequestPreview(selectedRequest)?.previewUrl || getRequestPreview(selectedRequest)?.fileUrl} alt={selectedRequest.equipment?.model || 'preview'} loading="lazy" />
                        : <div className="service-board-card__preview-empty"><Icon name="equipment" /><span>Нет фото</span></div>}
                    </div>
                  </section>

                  <div className="detail-section-card">
                    <h4>Описание проблемы</h4>
                    <p>{selectedRequest.description || 'Без описания'}</p>
                  </div>

                  {canAssign ? (
                    <div className="detail-section-card">
                      <h4>{selectedRequest.assignedToUserId ? 'Переназначить инженера' : 'Назначить инженера'}</h4>
                      <select value={assignForm.assignedToUserId} onChange={(e) => setAssignForm({ assignedToUserId: e.target.value })}>
                        <option value="">Выберите инженера</option>
                        {engineers.filter((eng) => eng.isActive).map((eng) => <option key={eng.id} value={eng.id}>{eng.fullName}</option>)}
                      </select>
                      <ActionRail compact>
                        <ActionRailButton tone="brand" disabled={Boolean(actionLoading)} onClick={submitAssignment}>{actionLoading === 'assign' ? 'Сохраняем...' : 'Сохранить назначение'}</ActionRailButton>
                      </ActionRail>
                    </div>
                  ) : null}

                  <div className="detail-section-card">
                    <h4>Быстрые действия</h4>
                    <ActionRail>
                      {getRoleActions(selectedRequest, user).map((action) => (
                        <ActionRailButton key={`${action.kind}-${action.status || action.label}`} tone={action.kind === 'claim' ? 'brand' : 'default'} disabled={Boolean(actionLoading)} onClick={() => runAction(action)}>
                          {action.label}
                        </ActionRailButton>
                      ))}
                      {!getRoleActions(selectedRequest, user).length ? <p className="empty-copy">Для вашей роли быстрых действий нет.</p> : null}
                    </ActionRail>
                  </div>
                </>
              ) : null}

              {activeTab === 'history' ? (
                <div className="timeline-list">
                  {[...(selectedRequest.history || [])].map((item) => (
                    <article key={item.id} className="timeline-item">
                      <i />
                      <div>
                        <strong>{BOARD_LABELS[item.previousStatus] || item.previousStatus} → {BOARD_LABELS[item.nextStatus] || item.nextStatus}</strong>
                        <p>{item.comment || 'Без комментария'}</p>
                        <small>{formatDate(item.createdAt)}</small>
                      </div>
                    </article>
                  ))}
                  {assignmentHistory.map((item) => (
                    <article key={item.id} className="timeline-item">
                      <i />
                      <div>
                        <strong>Назначение: {item.toUser?.fullName || item.toUserId}</strong>
                        <p>{item.comment || 'Без комментария'}</p>
                        <small>{formatDate(item.createdAt)} · {item.assignedByUser?.fullName || 'система'}</small>
                      </div>
                    </article>
                  ))}
                  {!selectedRequest.history?.length && !assignmentHistory.length ? <p className="empty-copy">История пока пустая.</p> : null}
                </div>
              ) : null}

              {activeTab === 'media' ? (
                <div className="media-tab">
                  <div className="detail-section-card">
                    <h4>Фото до</h4>
                    <div className="media-grid">
                      {mediaGroups.before.map((item) => (
                        <a key={item.id} className="media-card" href={item.fileUrl} target="_blank" rel="noreferrer">
                          {String(item.mimeType || '').startsWith('video/') ? <video src={item.fileUrl} controls preload="metadata" /> : <img src={item.previewUrl || item.fileUrl} alt={item.originalName || 'before'} />}
                          <small>{item.originalName || 'Фото до'}</small>
                        </a>
                      ))}
                      {!mediaGroups.before.length ? <p className="empty-copy media-empty">Фото до еще не загружены.</p> : null}
                    </div>
                  </div>

                  <div className="detail-section-card">
                    <h4>Фото после</h4>
                    <div className="media-grid">
                      {mediaGroups.after.map((item) => (
                        <a key={item.id} className="media-card" href={item.fileUrl} target="_blank" rel="noreferrer">
                          {String(item.mimeType || '').startsWith('video/') ? <video src={item.fileUrl} controls preload="metadata" /> : <img src={item.previewUrl || item.fileUrl} alt={item.originalName || 'after'} />}
                          <small>{item.originalName || 'Фото после'}</small>
                        </a>
                      ))}
                      {!mediaGroups.after.length ? <p className="empty-copy media-empty">Фото после еще не загружены.</p> : null}
                    </div>
                  </div>

                  <div className="detail-section-card">
                    <h4>Загрузить медиа</h4>
                    <select value={mediaStage} onChange={(e) => setMediaStage(e.target.value)}>
                      <option value="before">Фото до</option>
                      <option value="after">Фото после</option>
                    </select>
                    <input type="file" multiple accept="image/*,video/*" onChange={(e) => setMediaFiles(Array.from(e.target.files || []))} />
                    <ActionRail compact>
                      <ActionRailButton tone="brand" disabled={Boolean(actionLoading) || !mediaFiles.length} onClick={submitMedia}>{actionLoading === 'media' ? 'Загрузка...' : 'Загрузить'}</ActionRailButton>
                    </ActionRail>
                  </div>
                </div>
              ) : null}

              {activeTab === 'notes' ? (
                <div className="notes-tab">
                  <div className="assignment-history">
                    {(selectedRequest.notes || []).map((note) => (
                      <article key={note.id} className="note-item">
                        <strong>{note.authorRole || 'system'}</strong>
                        <p>{note.text}</p>
                        <small>{formatDate(note.createdAt)}</small>
                      </article>
                    ))}
                    {!(selectedRequest.notes || []).length ? <p className="empty-copy">Заметок пока нет.</p> : null}
                  </div>
                  {canSeeInternalNotes ? (
                    <div className="detail-section-card note-composer">
                      <h4>Добавить внутреннюю заметку</h4>
                      <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={3} placeholder="Комментарий для сервисной команды" />
                      <ActionRail compact>
                        <ActionRailButton tone="brand" disabled={Boolean(actionLoading)} onClick={submitNote}>{actionLoading === 'note' ? 'Сохраняем...' : 'Сохранить заметку'}</ActionRailButton>
                      </ActionRail>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </DetailPanel>
      </div>
    </section>
  );
}
