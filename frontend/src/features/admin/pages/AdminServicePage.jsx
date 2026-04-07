import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { adminServiceApi } from '../api/adminServiceApi';
import { ROLES } from '../roleConfig';
import {
  ActionRail,
  ActionRailButton,
  Icon,
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

function getBaseAdminPath(pathname = '') {
  return pathname.startsWith('/tg/admin') ? '/tg/admin' : '/admin';
}

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

function ServiceBoardToolbar({ boardNavItems, onBoardNav }) {
  return (
    <div className="equipment-list-toolbar">
      <div className="equipment-list-toolbar__copy">
        <small>Service lane</small>
        <strong>Лента сервисных заявок</strong>
      </div>
      <div className="equipment-board-nav" aria-label="Навигация по колонкам сервиса">
        {boardNavItems.map((column) => (
          <button key={column.key} type="button" className="equipment-board-nav__chip" onClick={() => onBoardNav?.(column.key)}>
            <span>{column.label}</span>
            <strong>{column.count}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function ServiceSummaryColumn({ dashboard }) {
  const kpis = dashboard?.kpis || [];
  const attention = dashboard?.attention || [];

  return (
    <section className="equipment-board-column equipment-board-column--summary service-board-column-trello" data-accent="gold">
      <header className="equipment-board-column__header equipment-board-column__header--summary service-board-column-trello__header">
        <div>
          <small>Service pulse</small>
          <h4>Сводка</h4>
        </div>
        <strong>{kpis.reduce((sum, item) => sum + Number(item.value || 0), 0)}</strong>
      </header>

      <div className="equipment-board-summary-grid">
        {kpis.slice(0, 6).map((item) => (
          <article key={item.key} className="equipment-board-summary-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>workflow</small>
          </article>
        ))}
      </div>

      <article className="equipment-hub-alerts equipment-hub-alerts--column">
        <header>
          <div>
            <small>Контроль</small>
            <h3>Внимание</h3>
          </div>
          <small>{attention.reduce((sum, item) => sum + Number(item.value || 0), 0)} сигналов</small>
        </header>
        <div className="equipment-hub-alerts__grid equipment-hub-alerts__grid--column">
          {attention.map((item) => (
            <button key={item.key} type="button" className="equipment-hub-alert equipment-hub-alert--warning">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </button>
          ))}
          {!attention.length ? <p className="empty-copy">Сигналов нет.</p> : null}
        </div>
      </article>
    </section>
  );
}

export function AdminServicePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { requestId } = useParams();
  const canAssign = [ROLES.serviceHead, ROLES.manager, ROLES.owner].includes(user?.role);
  const canSeeInternalNotes = [ROLES.serviceEngineer, ROLES.serviceHead, ROLES.manager, ROLES.director, ROLES.owner].includes(user?.role);
  const basePath = getBaseAdminPath(location.pathname);

  const [requests, setRequests] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [engineers, setEngineers] = useState([]);
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
  const [searchTerm, setSearchTerm] = useState('');
  const boardRef = useRef(null);
  const boardColumnRefs = useRef({});

  async function load() {
    setLoading(true);
    try {
      const [list, dash, engineerPayload] = await Promise.all([
        adminServiceApi.list({ sort: 'updatedAt' }),
        adminServiceApi.dashboard({}),
        adminServiceApi.serviceEngineers().catch(() => ({ engineers: [] })),
      ]);

      const rows = list.requests || [];
      setRequests(rows);
      setDashboard(dash || null);
      setEngineers(engineerPayload.engineers || []);
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
    if (!requestId) {
      setSelectedRequest(null);
      setAssignmentHistory([]);
      return;
    }
    loadDetails(requestId).catch(() => {
      setSelectedRequest(null);
      setAssignmentHistory([]);
    });
  }, [requestId]);

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
      if (requestId === request.id) {
        await loadDetails(request.id);
      }
      setFeedback(action.label);
    } catch (actionError) {
      setError(actionError?.message || 'Не удалось выполнить действие.');
    } finally {
      setActionLoading('');
    }
  }

  async function submitAssignment() {
    if (!requestId || !assignForm.assignedToUserId) return;
    setActionLoading('assign');
    setError('');
    try {
      await adminServiceApi.assignManager(requestId, assignForm.assignedToUserId, 'Assigned from service board');
      await load();
      await loadDetails(requestId);
      setFeedback('Инженер назначен.');
    } catch (assignError) {
      setError(assignError?.message || 'Не удалось назначить инженера.');
    } finally {
      setActionLoading('');
    }
  }

  async function submitNote() {
    if (!requestId || !noteBody.trim()) return;
    setActionLoading('note');
    setError('');
    try {
      await adminServiceApi.addNote(requestId, noteBody.trim());
      setNoteBody('');
      await loadDetails(requestId);
      setFeedback('Заметка добавлена.');
    } catch (noteError) {
      setError(noteError?.message || 'Не удалось сохранить заметку.');
    } finally {
      setActionLoading('');
    }
  }

  async function submitMedia() {
    if (!requestId || !mediaFiles.length) return;
    setActionLoading('media');
    setError('');
    try {
      await adminServiceApi.uploadRequestMedia(requestId, mediaFiles, mediaStage);
      setMediaFiles([]);
      await load();
      await loadDetails(requestId);
      setFeedback(mediaStage === 'after' ? 'Фото после загружены.' : 'Фото до загружены.');
    } catch (mediaError) {
      setError(mediaError?.message || 'Не удалось загрузить медиа.');
    } finally {
      setActionLoading('');
    }
  }

  const filteredRequests = useMemo(() => requests.filter((item) => {
    if (!searchTerm.trim()) return true;
    const haystack = [
      item.id,
      item.client?.companyName,
      item.client?.contactName,
      item.pointUser?.fullName,
      item.location?.name,
      item.equipment?.brand,
      item.equipment?.model,
      item.description,
      item.assignedToUser?.fullName,
    ].join(' ').toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  }), [requests, searchTerm]);

  const boardColumns = useMemo(() => BOARD_COLUMNS.map((status) => ({
    status,
    label: BOARD_LABELS[status],
    items: filteredRequests.filter((item) => item.status === status),
  })), [filteredRequests]);
  const boardNavItems = useMemo(() => [
    { key: 'summary', label: 'Сводка', count: (dashboard?.kpis || []).reduce((sum, item) => sum + Number(item.value || 0), 0) },
    ...boardColumns.map((column) => ({ key: column.status, label: column.label, count: column.items.length })),
  ], [boardColumns, dashboard]);
  const mediaGroups = splitMediaByStage(selectedRequest?.media || []);
  const detailRouteMode = Boolean(requestId);

  function selectRequest(id) {
    navigate(`${basePath}/service/${id}`);
  }

  function closeDetail() {
    navigate(`${basePath}/service`);
  }

  function scrollToBoardColumn(key) {
    const container = boardRef.current;
    const target = boardColumnRefs.current[key];
    if (!container || !target) return;
    container.scrollTo({ left: Math.max(target.offsetLeft - 12, 0), behavior: 'smooth' });
  }

  return (
    <section className="service-dashboard">
      <header className="service-command">
        <div className="service-command__copy">
          <small>Service board</small>
          <h2>Сервисные заявки</h2>
          <p>Редакционный kanban по заявкам: входящий поток, инженерная работа, QC и финализация без перегруженных панелей.</p>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {feedback ? <p>{feedback}</p> : null}

      {!detailRouteMode ? (
        <section className="equipment-ops-board-page">
          <div className="equipment-board-toolbar-shell">
            <div className="equipment-list-search">
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Поиск: клиент, точка, оборудование, инженер…"
              />
            </div>
            <ServiceBoardToolbar boardNavItems={boardNavItems} onBoardNav={scrollToBoardColumn} />
          </div>
          <div className="equipment-ops-list equipment-ops-list--full equipment-board-shell">
            <div ref={boardRef} className="service-board service-board--full">
              <div ref={(node) => { boardColumnRefs.current.summary = node; }} className="equipment-board-column-anchor">
                <ServiceSummaryColumn dashboard={dashboard} />
              </div>
              {loading ? <p>Загрузка...</p> : null}
              {boardColumns.map((column) => (
                <section
                  key={column.status}
                  ref={(node) => { boardColumnRefs.current[column.status] = node; }}
                  className="service-board-column-trello"
                  data-accent={COLUMN_THEME[column.status]?.accent || 'blue'}
                >
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
                        active={requestId === request.id}
                        user={user}
                        actionLoading={actionLoading}
                        onSelect={selectRequest}
                        onAction={(action) => runAction(action, request)}
                      />
                    ))}
                    {!column.items.length ? <p className="empty-copy">Пусто</p> : null}
                  </div>
                </section>
              ))}
            </div>
            {!filteredRequests.length ? <p className="empty-copy">Нет заявок по текущему поиску.</p> : null}
          </div>
        </section>
      ) : (
        <section className="equipment-ops-detail-page">
          <article className="equipment-ops-detail equipment-ops-detail--page">
            <button type="button" className="equipment-back-button" onClick={closeDetail}>← Назад к ленте</button>
            {!selectedRequest ? <p>Выберите заявку на доске.</p> : (
            <>
              <header className="equipment-ops-detail__hero">
                <div className="equipment-ops-detail__hero-copy">
                  <small>Service request</small>
                  <h3>Заявка #{selectedRequest.id}</h3>
                  <p>{selectedRequest.client?.companyName || selectedRequest.pointUser?.fullName || 'Клиент'} · {selectedRequest.location?.name || selectedRequest.equipment?.locationName || 'Точка не выбрана'}</p>
                  <div className="equipment-ops-detail__hero-statuses">
                    <StatusBadge status={selectedRequest.status}>{BOARD_LABELS[selectedRequest.status] || selectedRequest.status}</StatusBadge>
                    <StatusBadge status={selectedRequest.urgency || 'normal'}>{selectedRequest.urgency || 'normal'}</StatusBadge>
                  </div>
                </div>
                <div className="equipment-ops-detail__hero-preview">
                  {getRequestPreview(selectedRequest)?.previewUrl || getRequestPreview(selectedRequest)?.fileUrl
                    ? <img className="ticket-preview" src={getRequestPreview(selectedRequest)?.previewUrl || getRequestPreview(selectedRequest)?.fileUrl} alt={selectedRequest.equipment?.model || 'preview'} loading="lazy" />
                    : <div className="service-board-card__preview-empty"><Icon name="equipment" /><span>Нет фото</span></div>}
                </div>
              </header>

              <ActionRail className="equipment-ops-detail__hero-actions">
                <ActionRailButton tone="brand" onClick={() => setActiveTab('overview')}>Обзор</ActionRailButton>
                <ActionRailButton onClick={() => setActiveTab('media')}>Фото / видео</ActionRailButton>
                <ActionRailButton onClick={() => setActiveTab('history')}>История</ActionRailButton>
                <ActionRailButton onClick={() => setActiveTab('notes')}>Заметки</ActionRailButton>
              </ActionRail>
              <nav className="equipment-tabs">
                {DETAIL_TABS.map((tab) => <button key={tab} type="button" className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{TAB_LABELS[tab]}</button>)}
              </nav>

              {activeTab === 'overview' ? (
                <>
                  <section className="detail-section-card">
                      <div className="equipment-detail-grid">
                        <p><Icon name="clients" /> Клиент: {selectedRequest.client?.companyName || '—'}</p>
                        <p><Icon name="employees" /> Бариста: {selectedRequest.pointUser?.fullName || '—'}</p>
                        <p><Icon name="equipment" /> Оборудование: {selectedRequest.equipment?.brand || '—'} {selectedRequest.equipment?.model || ''}</p>
                        <p><Icon name="equipment" /> Точка: {selectedRequest.location?.name || selectedRequest.equipment?.locationName || '—'}</p>
                        <p><Icon name="service" /> Срочность: {selectedRequest.urgency || 'normal'}</p>
                        <p><Icon name="dashboard" /> Назначен: {selectedRequest.assignedToUser?.fullName || 'Не назначен'}</p>
                        <p><Icon name="content" /> Может работать: {selectedRequest.canOperateNow ? 'Да' : 'Нет'}</p>
                        <p><Icon name="clients" /> Обновлено: {formatDate(selectedRequest.updatedAt)}</p>
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
          </article>
        </section>
      )}
    </section>
  );
}
