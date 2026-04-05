import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { adminServiceApi } from '../api/adminServiceApi';
import { ROLES } from '../roleConfig';
import {
  AlertPanel,
  DetailPanel,
  FilterRow,
  Icon,
  KPIChipCard,
  OpsBoardCard,
  StatusBadge,
} from '../components/AdminUi';

const BOARD_COLUMNS = ['accepted', 'in_progress', 'testing', 'ready'];
const BOARD_LABELS = { accepted: 'Accepted', in_progress: 'In Progress', testing: 'Testing', ready: 'Ready' };
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
const KPI_ICON = {
  newCount: 'dashboard',
  inProgressCount: 'service',
  testingCount: 'service',
  readyCount: 'equipment',
  overdueCount: 'bell',
  unassignedCount: 'clients',
  assignAvg: 'employees',
  repairAvg: 'service',
  slaReady: 'equipment',
  slaBacklog: 'sales',
};
const DETAIL_TABS = ['overview', 'history', 'media', 'notes', 'equipment', 'commercial'];
const TAB_LABELS = {
  overview: 'Обзор', history: 'История', media: 'Медиа', notes: 'Заметки', equipment: 'Оборудование', commercial: 'Коммерция',
};

function formatDate(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }
function formatDuration(value) { return Number.isFinite(value) ? `${value} мин` : '—'; }
function formatPersonAudit(item) {
  if (!item) return '—';
  if (item.user?.fullName) return item.user.fullName;
  return item.actorLabel || '—';
}

function ServiceTicketCard({ request, active, onSelect }) {
  const status = request.serviceStatus || request.status;
  const warnings = [];
  if (!request.assignedToUserId) warnings.push('Unassigned');
  if (!request.equipmentId) warnings.push('No equipment');
  if (status === 'in_progress' && (Date.now() - new Date(request.updatedAt).getTime()) > 48 * 3600000) warnings.push('Stale');
  if (status === 'ready' && (Date.now() - new Date(request.updatedAt).getTime()) > 24 * 3600000) warnings.push('Ready too long');

  return (
    <OpsBoardCard
      item={request}
      id={request.id}
      status={status}
      statusLabel={STATUS_LABELS[status] || status}
      title={request.equipment?.clientName || request.client?.companyName || 'Клиент без названия'}
      subtitle={`${request.equipment?.brand || '—'} ${request.equipment?.model || ''} · ${request.equipment?.internalNumber || request.internalNumberSnapshot || '—'} / ${request.equipment?.serial || request.serialNumberSnapshot || '—'}`}
      ownerType={`owner: ${request.equipment?.ownerType || '—'}`}
      intakeType={`intake: ${request.intakeType || '—'}`}
      assignedMaster={request.assignedToUser?.fullName || 'Мастер: не назначен'}
      serviceStatus={STATUS_LABELS[status] || status}
      commercialStatus={COMMERCIAL_STATUS_LABELS[request.equipment?.commercialStatus || 'none'] || 'none'}
      updatedAt={formatDate(request.updatedAt)}
      warnings={warnings}
      active={active}
      onSelect={onSelect}
    />
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

  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    quickFilter: searchParams.get('quickFilter') || 'all',
    engineer: 'all',
    id: '',
    client: '',
    status: searchParams.get('status') || 'all',
  });
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
  const [actionLoading, setActionLoading] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  async function load(next = filters) {
    setLoading(true);
    try {
      const [list, dash, engineerPayload] = await Promise.all([
        adminServiceApi.serviceCases({
          ...next,
          serviceStatus: next.status === 'all' ? '' : next.status,
          assignedToUserId: next.engineer === 'all' ? '' : next.engineer,
          search: next.client || next.id || '',
        }),
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
    setActionLoading('assign');
    await adminServiceApi.assignServiceCase(selectedId, assignForm.assignedToUserId);
    setAssignForm({ assignedToUserId: '' });
    await load();
    await loadDetails(selectedId);
    setFeedback('Назначение обновлено.');
    setActionLoading('');
  }

  async function applyServiceStatus(toStatus) {
    if (!selectedId || !toStatus) return;
    setActionLoading(`service:${toStatus}`);
    await adminServiceApi.updateServiceCaseStatus(selectedId, { serviceStatus: toStatus });
    await load();
    await loadDetails(selectedId);
    setFeedback(`Сервисный статус обновлен: ${STATUS_LABELS[toStatus] || toStatus}.`);
    setActionLoading('');
  }

  async function applyCommercialStatus(toStatus) {
    const equipmentId = selectedRequest?.equipmentId;
    if (!equipmentId || !toStatus) return;
    setActionLoading(`commercial:${toStatus}`);
    await adminServiceApi.updateCommercialStatus(equipmentId, toStatus, '', selectedId);
    await load();
    await loadDetails(selectedId);
    setFeedback(`Коммерческий статус обновлен: ${COMMERCIAL_STATUS_LABELS[toStatus] || toStatus}.`);
    setActionLoading('');
  }

  async function submitNote() {
    if (!selectedId || !noteBody.trim()) return;
    setActionLoading('note');
    await adminServiceApi.addServiceCaseNote(selectedId, noteBody.trim(), true);
    setNoteBody('');
    await loadDetails(selectedId);
    setFeedback('Заметка добавлена.');
    setActionLoading('');
  }

  async function submitMedia() {
    if (!selectedId || !mediaFiles.length) return;
    setActionLoading('media');
    await adminServiceApi.uploadServiceCaseMedia(selectedId, mediaFiles, mediaCaption.trim());
    setMediaFiles([]);
    setMediaCaption('');
    await loadDetails(selectedId);
    setFeedback('Медиа загружено.');
    setActionLoading('');
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
    if (filters.quickFilter === 'overdue') {
      const ageHours = (Date.now() - new Date(item.updatedAt).getTime()) / 3600000;
      return (item.serviceStatus === 'accepted' && ageHours > 12)
        || (item.serviceStatus === 'in_progress' && ageHours > 48)
        || (item.serviceStatus === 'testing' && ageHours > 24)
        || (item.serviceStatus === 'ready' && ageHours > 24);
    }
    if (filters.quickFilter === 'stale_ready') return item.serviceStatus === 'ready' && (Date.now() - new Date(item.updatedAt).getTime()) > 24 * 3600000;
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
  const workflowActions = selectedRequest?.nextActions?.all || [];
  const serviceActions = workflowActions.filter((action) => action.type === 'service');
  const commercialActions = workflowActions.filter((action) => action.type === 'commercial');

  const requiresAttention = {
    unassigned: requests.filter((i) => !i.assignedToUserId).length,
    withoutEquipment: requests.filter((i) => !i.equipmentId).length,
    stuckInProgress: requests.filter((i) => i.serviceStatus === 'in_progress' && (Date.now() - new Date(i.updatedAt).getTime()) > 48 * 3600000).length,
    readyTooLong: requests.filter((i) => i.serviceStatus === 'ready' && (Date.now() - new Date(i.updatedAt).getTime()) > 24 * 3600000).length,
    rentSaleBacklog: requests.filter((i) => ['ready_for_rent', 'ready_for_sale'].includes(i.equipment?.commercialStatus)).length,
  };

  const kpis = [
    { key: 'newCount', label: 'Accepted', value: dashboard?.newCount || 0 },
    { key: 'inProgressCount', label: 'In progress', value: dashboard?.inProgressCount || 0 },
    { key: 'testingCount', label: 'Testing', value: dashboard?.testingCount || 0 },
    { key: 'readyCount', label: 'Ready', value: dashboard?.readyCount || 0 },
    { key: 'unassignedCount', label: 'Unassigned', value: dashboard?.unassignedCount || 0 },
    { key: 'overdueCount', label: 'Overdue', value: dashboard?.overdueCount || 0 },
    { key: 'assignAvg', label: 'Avg assign', value: formatDuration(dashboard?.roleAnalytics?.service?.avgAssignTimeMinutes) },
    { key: 'repairAvg', label: 'Avg repair', value: formatDuration(dashboard?.roleAnalytics?.service?.avgRepairTimeMinutes) },
    { key: 'slaReady', label: 'Stale ready', value: dashboard?.slaAging?.staleReadyCount || 0 },
    { key: 'slaBacklog', label: 'Stale rent/sale', value: dashboard?.slaAging?.staleRentSaleBacklogCount || 0 },
  ];

  return (
    <section className="service-dashboard">
      <header className="service-headline">
        <div><h2>Service Board</h2><p>Polished ops board: action-based workflow + role-driven UX.</p></div>
      </header>

      <div className="kpi-row">
        {kpis.map((item) => <KPIChipCard key={item.key} label={item.label} value={item.value} icon={KPI_ICON[item.key]} tone={item.key} hint="Service" />)}
      </div>

      <AlertPanel items={[
        <li key="unassigned"><span>Unassigned</span><strong>{requiresAttention.unassigned}</strong></li>,
        <li key="without_equipment"><span>No equipment data</span><strong>{requiresAttention.withoutEquipment}</strong></li>,
        <li key="stuck"><span>Stale in progress</span><strong>{requiresAttention.stuckInProgress}</strong></li>,
        <li key="ready"><span>Ready too long</span><strong>{requiresAttention.readyTooLong}</strong></li>,
        <li key="backlog"><span>Rent/sale backlog</span><strong>{requiresAttention.rentSaleBacklog}</strong></li>,
      ]} />

      <FilterRow>
        <label><span>Инженер</span><select value={filters.engineer} onChange={(e) => { const n = { ...filters, engineer: e.target.value }; setFilters(n); load(n); }}><option value="all">Все инженеры</option>{engineers.map((eng) => <option key={eng.id} value={eng.id}>{eng.fullName}</option>)}</select></label>
        <label><span>Быстрый фильтр</span><select value={filters.quickFilter} onChange={(e) => setFilters((prev) => ({ ...prev, quickFilter: e.target.value }))}><option value="all">Все</option><option value="unassigned">Без назначения</option><option value="mine">Мои</option><option value="overdue">Overdue</option><option value="stale_ready">Stale ready</option>{engineers.map((eng) => <option key={eng.id} value={`engineer:${eng.id}`}>Инженер: {eng.fullName}</option>)}</select></label>
        <label><span>Статус</span><select value={filters.status} onChange={(e) => { const n = { ...filters, status: e.target.value }; setFilters(n); load(n); }}><option value="all">Все</option><option value="accepted">Accepted</option><option value="in_progress">In Progress</option><option value="testing">Testing</option><option value="ready">Ready</option></select></label>
        <label><span>ID</span><input value={filters.id} onChange={(e) => setFilters((p) => ({ ...p, id: e.target.value }))} onBlur={() => load(filters)} placeholder="sc-1001" /></label>
        <label><span>Клиент</span><input value={filters.client} onChange={(e) => setFilters((p) => ({ ...p, client: e.target.value }))} onBlur={() => load(filters)} placeholder="поиск" /></label>
      </FilterRow>

      {error ? <p className="error-text">{error}</p> : null}
      {feedback ? <p>{feedback}</p> : null}

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
                  <div className="detail-split">
                    <div className="detail-grid">
                      <p><Icon name="equipment" /> Оборудование: {selectedRequest.equipment?.brand || '—'} {selectedRequest.equipment?.model || ''}</p>
                      <p><Icon name="equipment" /> Internal/Serial: {selectedRequest.equipment?.internalNumber || selectedRequest.internalNumberSnapshot || '—'} / {selectedRequest.equipment?.serial || selectedRequest.serialNumberSnapshot || '—'}</p>
                      <p><Icon name="service" /> Intake type: {selectedRequest.intakeType || '—'}</p>
                      <p><Icon name="clients" /> Owner type: {selectedRequest.equipment?.ownerType || '—'}</p>
                      <p><Icon name="dashboard" /> Service status: {STATUS_LABELS[selectedServiceStatus] || selectedServiceStatus}</p>
                      <p><Icon name="sales" /> Commercial status: {COMMERCIAL_STATUS_LABELS[selectedCommercialStatus] || selectedCommercialStatus}</p>
                      <p><Icon name="employees" /> Assigned: {selectedRequest.assignedToUser?.fullName || 'Не назначен'}</p>
                      <p><Icon name="clients" /> Last update: {formatDate(selectedRequest.updatedAt)}</p>
                    </div>
                    <div className="detail-stack">
                      {(selectedRequest.media || [])[0]?.fileUrl ? <img className="ticket-preview" src={(selectedRequest.media || [])[0].fileUrl} alt="preview" /> : null}
                    </div>
                  </div>

                  {canUseServiceBoardActions && serviceActions.length ? (
                    <div className="assignment-box">
                      <h4>Доступные сервисные действия</h4>
                      <div className="quick-filter-row">{serviceActions.map((action) => <button disabled={Boolean(actionLoading)} key={action.key + action.targetStatus} type="button" onClick={() => applyServiceStatus(action.targetStatus).catch(() => setError('Не удалось обновить сервисный статус.'))}>{actionLoading === `service:${action.targetStatus}` ? 'Сохраняем...' : action.label}</button>)}</div>
                    </div>
                  ) : null}

                  {canUseServiceBoardActions && commercialActions.length ? (
                    <div className="assignment-box">
                      <h4>Доступные коммерческие действия</h4>
                      <div className="quick-filter-row">{commercialActions.map((action) => <button disabled={Boolean(actionLoading)} key={action.key + action.targetStatus} type="button" onClick={() => applyCommercialStatus(action.targetStatus).catch(() => setError('Не удалось обновить коммерческий статус.'))}>{actionLoading === `commercial:${action.targetStatus}` ? 'Сохраняем...' : action.label}</button>)}</div>
                    </div>
                  ) : null}

                  {canAssign ? (
                    <div className="assignment-box">
                      <h4>{selectedRequest.assignedToUserId ? 'Переназначить инженера' : 'Назначить инженера'}</h4>
                      <select value={assignForm.assignedToUserId} onChange={(e) => setAssignForm((prev) => ({ ...prev, assignedToUserId: e.target.value }))}>
                        <option value="">Выберите инженера</option>
                        {engineers.filter((eng) => eng.isActive).map((eng) => <option key={eng.id} value={eng.id}>{eng.fullName}</option>)}
                      </select>
                      <button disabled={Boolean(actionLoading)} type="button" onClick={() => submitAssignment().catch(() => setError('Не удалось назначить инженера.'))}>{actionLoading === 'assign' ? 'Сохраняем...' : 'Сохранить назначение'}</button>
                    </div>
                  ) : null}

                  <div className="assignment-box">
                    <h4>Audit trail</h4>
                    <div className="detail-grid">
                      <p><Icon name="employees" /> Назначил: {formatPersonAudit(selectedRequest.auditTrail?.assigned)} · {formatDate(selectedRequest.auditTrail?.assigned?.at)}</p>
                      <p><Icon name="service" /> Взял в работу: {formatPersonAudit(selectedRequest.auditTrail?.takenInWork)} · {formatDate(selectedRequest.auditTrail?.takenInWork?.at)}</p>
                      <p><Icon name="service" /> Перевёл в testing: {formatPersonAudit(selectedRequest.auditTrail?.movedToTesting)} · {formatDate(selectedRequest.auditTrail?.movedToTesting?.at)}</p>
                      <p><Icon name="equipment" /> Перевёл в ready: {formatPersonAudit(selectedRequest.auditTrail?.movedToReady)} · {formatDate(selectedRequest.auditTrail?.movedToReady?.at)}</p>
                      <p><Icon name="dashboard" /> Processed: {formatPersonAudit(selectedRequest.auditTrail?.processed)} · {formatDate(selectedRequest.auditTrail?.processed?.at)}</p>
                    </div>
                    <div className="timeline-list compact">
                      {(selectedRequest.auditTrail?.commercialChanges || []).map((item) => (
                        <article key={item.id} className="timeline-item">
                          <i />
                          <div>
                            <strong>Commercial: {item.fromStatus || '—'} → {item.toStatus || '—'}</strong>
                            <small>{formatDate(item.changedAt)} · {item.changedByUser?.fullName || item.actorLabel || 'system'}</small>
                          </div>
                        </article>
                      ))}
                      {!(selectedRequest.auditTrail?.commercialChanges || []).length ? <p className="empty-copy">Изменений commercial status пока нет.</p> : null}
                    </div>
                  </div>
                </>
              ) : null}

              {activeTab === 'history' ? <Timeline history={assignmentHistory} /> : null}

              {activeTab === 'media' ? (
                <div className="media-tab">
                  <div className="timeline-list compact">
                    {[...(selectedRequest.media || [])]
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((item) => (
                        <article key={`timeline-${item.id}`} className="timeline-item">
                          <i />
                          <div>
                            <strong>{item.kind === 'video' ? 'Видео' : 'Фото'} · {item.caption || item.originalName || 'Без подписи'}</strong>
                            <small>{formatDate(item.createdAt)} · {item.uploadedByUser?.fullName || 'system'}</small>
                          </div>
                        </article>
                      ))}
                    {!(selectedRequest.media || []).length ? <p className="empty-copy">Хронология медиа пока пустая.</p> : null}
                  </div>
                  <div className="media-grid">
                    {[...(selectedRequest.media || [])]
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((item) => (
                      <a key={item.id} className="media-card" href={item.fileUrl} target="_blank" rel="noreferrer">
                        {item.kind === 'photo' ? <img src={item.fileUrl} alt={item.caption || item.originalName || 'photo'} /> : <video src={item.fileUrl} controls preload="metadata" />}
                        <small>{item.caption || item.originalName || item.kind}</small>
                      </a>
                    ))}
                    {!(selectedRequest.media || []).length ? <p className="empty-copy media-empty">Пока нет файлов. Загрузите фото/видео для кейса.</p> : null}
                  </div>
                  {canUseServiceBoardActions ? (
                    <div className="assignment-box">
                      <h4>Upload media</h4>
                      <p className="empty-copy">Поддерживаются фото и видео. Файлы сохраняются в disk storage.</p>
                      <input type="file" multiple accept="image/*,video/*" onChange={(e) => setMediaFiles(Array.from(e.target.files || []))} />
                      <input value={mediaCaption} onChange={(e) => setMediaCaption(e.target.value)} placeholder="Подпись (опц.)" maxLength={200} />
                      {mediaFiles.length ? <small>К загрузке: {mediaFiles.length} файл(ов).</small> : <small>Файлы не выбраны.</small>}
                      <button disabled={Boolean(actionLoading)} type="button" onClick={() => submitMedia().catch(() => setError('Не удалось загрузить медиа.'))}>{actionLoading === 'media' ? 'Загрузка...' : 'Загрузить'}</button>
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
                      <button disabled={Boolean(actionLoading)} type="button" onClick={() => submitNote().catch(() => setError('Не удалось сохранить заметку.'))}>{actionLoading === 'note' ? 'Сохраняем...' : 'Сохранить заметку'}</button>
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
