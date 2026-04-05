import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { adminServiceApi } from '../api/adminServiceApi';
import { ROLES } from '../roleConfig';
import { getAvailableCommercialActions, getAvailableServiceActions } from '../workflowConfig';
import {
  AlertPanel,
  DetailPanel,
  FilterRow,
  Icon,
  KPIChipCard,
  StatusBadge,
} from '../components/AdminUi';

const BOARD_COLUMNS = ['accepted', 'in_progress', 'testing', 'ready'];
const BOARD_LABELS = { accepted: 'Accepted', in_progress: 'In Progress', testing: 'Testing', ready: 'Ready' };
const STATUS_OPTIONS = [
  { value: 'all', label: 'Все статусы' },
  { value: 'accepted', label: 'Принятые' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'testing', label: 'Тест' },
  { value: 'ready', label: 'Готово директору' },
  { value: 'processed', label: 'Проведено' },
  { value: 'closed', label: 'Закрыто' },
];
const STATUS_LABELS = { accepted: 'Принято', in_progress: 'В работе', testing: 'Тест', ready: 'Готово', processed: 'Проведено', closed: 'Закрыто' };
const COMMERCIAL_STATUS_LABELS = {
  none: 'Нет',
  ready_for_issue: 'Готово к выдаче',
  ready_for_rent: 'Готово к аренде',
  ready_for_sale: 'Готово к продаже',
  issued_to_client: 'Выдано клиенту',
  reserved_for_rent: 'Бронь аренды',
  out_on_rent: 'В аренде',
  out_on_replacement: 'На подмене',
  reserved_for_sale: 'Бронь продажи',
  sold: 'Продано',
};
const KPI_ICON = { newCount: 'dashboard', inProgressCount: 'service', testingCount: 'service', readyCount: 'equipment', overdueCount: 'bell', unassignedCount: 'clients', closedTodayCount: 'sales' };
const DETAIL_TABS = ['overview', 'history', 'media', 'notes', 'equipment', 'commercial'];
const TAB_LABELS = {
  overview: 'Обзор', history: 'История', media: 'Медиа', notes: 'Заметки', equipment: 'Оборудование', commercial: 'Коммерция',
};

function formatDate(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }

function ServiceTicketCard({ request, active, onSelect }) {
  const status = request.serviceStatus || request.status;
  return (
    <button type="button" className={`ticket-card ${active ? 'active' : ''} ${!request.assignedToUserId ? 'unassigned' : ''}`} onClick={() => onSelect(request.id)}>
      <i className="ticket-strip" data-status={status} />
      <div className="ticket-top"><StatusBadge status={status}>{STATUS_LABELS[status] || status}</StatusBadge><small>#{request.id}</small></div>
      <strong>{request.equipment?.clientName || request.client?.companyName || 'Клиент без названия'}</strong>
      <p>{request.equipment?.brand || '—'} {request.equipment?.model || ''}</p>
      <div className="ticket-tags">
        {!request.assignedToUserId ? <em className="danger">Без назначения</em> : <em>{request.assignedToUser?.fullName || request.assignedToUserId}</em>}
        <em>{request.intakeType || '—'}</em>
      </div>
      <div className="ticket-meta"><span>🕒 {formatDate(request.updatedAt)}</span></div>
    </button>
  );
}

function Timeline({ history }) {
  const rows = [...(history || [])].sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  if (!rows.length) return <p className="empty-copy">История пока пустая.</p>;
  return (
    <div className="timeline-list">
      {rows.map((item) => (
        <article key={item.id} className="timeline-item">
          <i />
          <div>
            <strong>{item.fromServiceStatus || item.fromStatusRaw || '—'} → {item.toServiceStatus || item.toStatusRaw || '—'}</strong>
            <p>{item.comment || 'Без комментария'}</p>
            <small>{formatDate(item.changedAt)} · {item.changedByUser?.fullName || item.actorLabel || 'system'}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

export function AdminServicePage() {
  const { user } = useAuth();
  const canAssign = [ROLES.serviceHead, ROLES.manager, ROLES.owner].includes(user?.role);
  const canUseServiceBoardActions = ![ROLES.salesManager].includes(user?.role);
  const canSeeInternalNotes = [ROLES.serviceEngineer, ROLES.serviceHead, ROLES.manager, ROLES.director, ROLES.owner].includes(user?.role);

  const [filters, setFilters] = useState({ status: 'all', quickFilter: 'all', engineer: 'all', id: '', client: '' });
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
  const [mediaCaption, setMediaCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(next = filters) {
    setLoading(true);
    try {
      const [list, dash, engineerPayload] = await Promise.all([
        adminServiceApi.serviceCases({ ...next, serviceStatus: next.status === 'all' ? '' : next.status, assignedToUserId: next.engineer === 'all' ? '' : next.engineer, search: next.client || next.id || '' }),
        adminServiceApi.serviceKpi(),
        canAssign ? adminServiceApi.serviceEngineers() : Promise.resolve({ engineers: [] }),
      ]);
      setRequests(list.items || []);
      setDashboard(dash || null);
      setEngineers(engineerPayload.engineers || []);
      setSelectedId((prev) => prev || list.items?.[0]?.id || null);
      setError('');
    } catch {
      setError('Не удалось загрузить сервисный дашборд.');
    } finally { setLoading(false); }
  }

  async function loadDetails(id) {
    const [payload, assignment] = await Promise.all([
      adminServiceApi.serviceCaseById(id),
      adminServiceApi.serviceCaseHistory(id).catch(() => ({ history: [] })),
    ]);
    setSelectedRequest(payload.item || null);
    setAssignmentHistory(assignment.history || []);
  }

  async function submitAssignment() {
    if (!assignForm.assignedToUserId) return;
    await adminServiceApi.assignServiceCase(selectedId, assignForm.assignedToUserId);
    setAssignForm({ assignedToUserId: '' });
    await load();
    await loadDetails(selectedId);
  }

  async function applyServiceStatus(toStatus) {
    if (!selectedId || !toStatus) return;
    await adminServiceApi.updateServiceCaseStatus(selectedId, { serviceStatus: toStatus });
    await load();
    await loadDetails(selectedId);
  }

  async function applyCommercialStatus(toStatus) {
    const equipmentId = selectedRequest?.equipmentId;
    if (!equipmentId || !toStatus) return;
    await adminServiceApi.updateCommercialStatus(equipmentId, toStatus, '', selectedId);
    await load();
    await loadDetails(selectedId);
  }

  async function submitNote() {
    if (!selectedId || !noteBody.trim()) return;
    await adminServiceApi.addServiceCaseNote(selectedId, noteBody.trim(), true);
    setNoteBody('');
    await loadDetails(selectedId);
  }

  async function submitMedia() {
    if (!selectedId || !mediaFiles.length) return;
    await adminServiceApi.uploadServiceCaseMedia(selectedId, mediaFiles, mediaCaption.trim());
    setMediaFiles([]);
    setMediaCaption('');
    await loadDetails(selectedId);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => {
    if (!selectedId) return setSelectedRequest(null);
    loadDetails(selectedId).catch(() => {
      setSelectedRequest(null);
      setAssignmentHistory([]);
    });
  }, [selectedId]);

  const filteredRequests = useMemo(() => requests.filter((item) => {
    if (filters.quickFilter === 'unassigned') return !item.assignedToUserId;
    if (filters.quickFilter === 'mine') return item.assignedToUserId === user?.id;
    if (filters.quickFilter?.startsWith('engineer:')) return item.assignedToUserId === filters.quickFilter.replace('engineer:', '');
    return true;
  }), [filters.quickFilter, requests, user?.id]);

  const boardColumns = useMemo(() => BOARD_COLUMNS.map((status) => ({
    status,
    label: BOARD_LABELS[status],
    items: filteredRequests.filter((item) => (item.serviceStatus || item.status) === status),
  })), [filteredRequests]);

  const selectedServiceStatus = selectedRequest?.serviceStatus || selectedRequest?.status;
  const selectedCommercialStatus = selectedRequest?.equipment?.commercialStatus || 'none';
  const serviceActions = (selectedRequest?.availableServiceActions || getAvailableServiceActions(user?.role, selectedServiceStatus));
  const commercialActions = (selectedRequest?.availableCommercialActions || getAvailableCommercialActions(user?.role, selectedServiceStatus, selectedCommercialStatus));

  const requiresAttention = {
    unassigned: requests.filter((i) => !i.assignedToUserId).length,
    critical: requests.filter((i) => String(i.priority || '').toLowerCase() === 'critical').length,
    readyNotProcessed: requests.filter((i) => i.serviceStatus === 'ready').length,
    stuckInProgress: requests.filter((i) => i.serviceStatus === 'in_progress' && (Date.now() - new Date(i.updatedAt).getTime()) > 48 * 3600000).length,
    withoutEquipment: requests.filter((i) => !i.equipmentId).length,
  };

  const kpis = [
    { key: 'newCount', label: 'Новых', value: dashboard?.newCount || 0 },
    { key: 'inProgressCount', label: 'В работе', value: dashboard?.inProgressCount || 0 },
    { key: 'testingCount', label: 'Тест', value: dashboard?.testingCount || 0 },
    { key: 'readyCount', label: 'Ready', value: dashboard?.readyCount || 0 },
    { key: 'unassignedCount', label: 'Без назначения', value: dashboard?.unassignedCount || 0 },
    { key: 'overdueCount', label: 'Просроченных', value: dashboard?.overdueCount || 0 },
    { key: 'closedTodayCount', label: 'Закрыто сегодня', value: dashboard?.closedTodayCount || 0 },
  ];

  return (
    <section className="service-dashboard">
      <header className="service-headline">
        <div><h2>Service Board</h2><p>Kanban/ops-доска поверх workflow engine с role-driven UI.</p></div>
      </header>

      <div className="kpi-row">
        {kpis.map((item) => <KPIChipCard key={item.key} label={item.label} value={item.value} icon={KPI_ICON[item.key]} tone={item.key} hint="Оперативно" />)}
      </div>

      <AlertPanel items={[
        <li key="unassigned"><span>Без назначения</span><strong>{requiresAttention.unassigned}</strong></li>,
        <li key="critical"><span>Критические</span><strong>{requiresAttention.critical}</strong></li>,
        <li key="ready"><span>Готово, не проведено</span><strong>{requiresAttention.readyNotProcessed}</strong></li>,
        <li key="stuck"><span>Зависшие в работе</span><strong>{requiresAttention.stuckInProgress}</strong></li>,
        <li key="without_equipment"><span>Без оборудования</span><strong>{requiresAttention.withoutEquipment}</strong></li>,
      ]} />

      <FilterRow>
        <label><span>Статус</span><select value={filters.status} onChange={(e) => { const n = { ...filters, status: e.target.value }; setFilters(n); load(n); }}>{STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label><span>Инженер</span><select value={filters.engineer} onChange={(e) => { const n = { ...filters, engineer: e.target.value }; setFilters(n); load(n); }}><option value="all">Все инженеры</option>{engineers.map((eng) => <option key={eng.id} value={eng.id}>{eng.fullName}</option>)}</select></label>
        <label><span>Быстрый фильтр</span><select value={filters.quickFilter} onChange={(e) => setFilters((prev) => ({ ...prev, quickFilter: e.target.value }))}><option value="all">Все</option><option value="unassigned">Без назначения</option><option value="mine">Мои</option>{engineers.map((eng) => <option key={eng.id} value={`engineer:${eng.id}`}>Инженер: {eng.fullName}</option>)}</select></label>
        <label><span>ID</span><input value={filters.id} onChange={(e) => setFilters((p) => ({ ...p, id: e.target.value }))} onBlur={() => load(filters)} placeholder="sc-1001" /></label>
        <label><span>Клиент</span><input value={filters.client} onChange={(e) => setFilters((p) => ({ ...p, client: e.target.value }))} onBlur={() => load(filters)} placeholder="поиск" /></label>
      </FilterRow>

      {error ? <p className="error-text">{error}</p> : null}

      {user?.role === ROLES.director ? (
        <section className="director-block">
          <h3>Director workflow block</h3>
          <div>
            <span>Ready: <strong>{requests.filter((i) => i.serviceStatus === 'ready').length}</strong></span>
            <span>Processed: <strong>{requests.filter((i) => i.serviceStatus === 'processed').length}</strong></span>
          </div>
        </section>
      ) : null}

      <div className="service-workspace kanban-layout">
        <div className="kanban-board">
          {loading ? <p>Загрузка...</p> : null}
          {boardColumns.map((column) => (
            <section key={column.status} className="kanban-column">
              <header>
                <h4>{column.label}</h4>
                <strong>{column.items.length}</strong>
              </header>
              <div className="kanban-cards">
                {column.items.map((request) => <ServiceTicketCard key={request.id} request={request} active={selectedId === request.id} onSelect={setSelectedId} />)}
                {!column.items.length ? <p className="empty-copy">Пусто</p> : null}
              </div>
            </section>
          ))}
        </div>

        <DetailPanel>
          {!selectedRequest ? <p>Выберите карточку на доске.</p> : (
            <>
              <header className="detail-header"><h3>Case #{selectedRequest.id}</h3><StatusBadge status={selectedServiceStatus}>{STATUS_LABELS[selectedServiceStatus] || selectedServiceStatus}</StatusBadge></header>
              <nav className="detail-tabs">
                {DETAIL_TABS.map((tab) => <button key={tab} type="button" className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{TAB_LABELS[tab]}</button>)}
              </nav>

              {activeTab === 'overview' ? (
                <>
                  <div className="detail-grid">
                    <p><Icon name="equipment" /> Оборудование: {selectedRequest.equipment?.brand || '—'} {selectedRequest.equipment?.model || ''}</p>
                    <p><Icon name="service" /> Intake type: {selectedRequest.intakeType || '—'}</p>
                    <p><Icon name="dashboard" /> Service status: {STATUS_LABELS[selectedServiceStatus] || selectedServiceStatus}</p>
                    <p><Icon name="employees" /> Assigned: {selectedRequest.assignedToUser?.fullName || 'Не назначен'}</p>
                    <p><Icon name="clients" /> Created: {formatDate(selectedRequest.createdAt)}</p>
                    <p><Icon name="clients" /> Updated: {formatDate(selectedRequest.updatedAt)}</p>
                  </div>

                  {canUseServiceBoardActions && serviceActions.length ? (
                    <div className="assignment-box">
                      <h4>Доступные сервисные действия</h4>
                      <div className="quick-filter-row">{serviceActions.map((statusKey) => <button key={statusKey} type="button" onClick={() => applyServiceStatus(statusKey).catch(() => setError('Не удалось обновить сервисный статус.'))}>→ {STATUS_LABELS[statusKey] || statusKey}</button>)}</div>
                    </div>
                  ) : null}

                  {canUseServiceBoardActions && commercialActions.length ? (
                    <div className="assignment-box">
                      <h4>Доступные коммерческие действия</h4>
                      <div className="quick-filter-row">{commercialActions.map((statusKey) => <button key={statusKey} type="button" onClick={() => applyCommercialStatus(statusKey).catch(() => setError('Не удалось обновить коммерческий статус.'))}>→ {COMMERCIAL_STATUS_LABELS[statusKey] || statusKey}</button>)}</div>
                    </div>
                  ) : null}

                  {canAssign ? (
                    <div className="assignment-box">
                      <h4>{selectedRequest.assignedToUserId ? 'Переназначить инженера' : 'Назначить инженера'}</h4>
                      <select value={assignForm.assignedToUserId} onChange={(e) => setAssignForm((prev) => ({ ...prev, assignedToUserId: e.target.value }))}>
                        <option value="">Выберите инженера</option>
                        {engineers.filter((eng) => eng.isActive).map((eng) => <option key={eng.id} value={eng.id}>{eng.fullName}</option>)}
                      </select>
                      <button type="button" onClick={() => submitAssignment().catch(() => setError('Не удалось назначить инженера.'))}>Сохранить назначение</button>
                    </div>
                  ) : null}
                </>
              ) : null}

              {activeTab === 'history' ? <Timeline history={assignmentHistory} /> : null}

              {activeTab === 'media' ? (
                <div className="media-tab">
                  <div className="media-grid">
                    {(selectedRequest.media || []).map((item) => (
                      <a key={item.id} className="media-card" href={item.fileUrl} target="_blank" rel="noreferrer">
                        {item.kind === 'photo' ? <img src={item.fileUrl} alt={item.caption || item.originalName || 'photo'} /> : <video src={item.fileUrl} controls preload="metadata" />}
                        <small>{item.caption || item.originalName || item.kind}</small>
                      </a>
                    ))}
                  </div>
                  {canUseServiceBoardActions ? (
                    <div className="assignment-box">
                      <h4>Upload media</h4>
                      <input type="file" multiple accept="image/*,video/*" onChange={(e) => setMediaFiles(Array.from(e.target.files || []))} />
                      <input value={mediaCaption} onChange={(e) => setMediaCaption(e.target.value)} placeholder="Подпись (опц.)" maxLength={200} />
                      <button type="button" onClick={() => submitMedia().catch(() => setError('Не удалось загрузить медиа.'))}>Загрузить</button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeTab === 'notes' ? (
                <div className="notes-tab">
                  <div className="assignment-history">
                    {(selectedRequest.notes || []).map((note) => (
                      <article key={note.id} className="note-item">
                        <strong>{note.authorUser?.fullName || '—'} · {note.isInternal ? 'Внутренняя' : 'Публичная'}</strong>
                        <p>{note.body}</p>
                        <small>{formatDate(note.createdAt)}</small>
                      </article>
                    ))}
                    {!(selectedRequest.notes || []).length ? <p className="empty-copy">Заметок пока нет.</p> : null}
                  </div>
                  {canSeeInternalNotes ? (
                    <div className="assignment-box note-composer">
                      <h4>Добавить внутреннюю заметку</h4>
                      <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={3} placeholder="Комментарий для service/manager/director" />
                      <button type="button" onClick={() => submitNote().catch(() => setError('Не удалось сохранить заметку.'))}>Сохранить заметку</button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeTab === 'equipment' ? (
                <div className="detail-grid">
                  <p><Icon name="equipment" /> ID: {selectedRequest.equipment?.id || selectedRequest.equipmentId || '—'}</p>
                  <p><Icon name="equipment" /> Серийный №: {selectedRequest.equipment?.serial || selectedRequest.serialNumberSnapshot || '—'}</p>
                  <p><Icon name="equipment" /> Internal №: {selectedRequest.equipment?.internalNumber || selectedRequest.internalNumberSnapshot || '—'}</p>
                  <p><Icon name="clients" /> Клиент: {selectedRequest.equipment?.clientName || selectedRequest.clientNameSnapshot || '—'}</p>
                </div>
              ) : null}

              {activeTab === 'commercial' ? (
                <div className="detail-grid">
                  <p><Icon name="sales" /> Текущий коммерческий статус: {COMMERCIAL_STATUS_LABELS[selectedCommercialStatus] || selectedCommercialStatus}</p>
                  <p><Icon name="sales" /> Invoice: {selectedRequest.invoiceNumber || '—'}</p>
                  <p><Icon name="sales" /> Invoice status: {selectedRequest.invoiceStatus || '—'}</p>
                </div>
              ) : null}
            </>
          )}
        </DetailPanel>
      </div>
    </section>
  );
}
