import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { adminServiceApi } from '../api/adminServiceApi';
import { ROLES } from '../roleConfig';
import { getAvailableCommercialActions, getAvailableServiceActions } from '../workflowConfig';
import {
  AlertPanel,
  ChartCard,
  CompactMetricCard,
  DetailPanel,
  FilterRow,
  Icon,
  KPIChipCard,
  StatusBadge,
  WorkloadWidget,
  useChartMax,
} from '../components/AdminUi';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Все статусы' },
  { value: 'accepted', label: 'Принятые' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'testing', label: 'Тест' },
  { value: 'ready', label: 'Готово директору' },
  { value: 'processed', label: 'Проведено' },
  { value: 'closed', label: 'Закрыто' },
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
const KPI_ICON = { newCount: 'dashboard', inProgressCount: 'service', overdueCount: 'bell', unassignedCount: 'clients', readyCount: 'equipment', processedCount: 'sales' };

function formatDate(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }
function barWidth(v, max) { return `${Math.max(6, Math.round((v / (max || 1)) * 100))}%`; }
function loadState(workload = {}) {
  const score = (workload.active || 0) + (workload.overdue || 0) * 2;
  if (score >= 8) return 'danger';
  if (score >= 4) return 'warning';
  return 'calm';
}

function getLoadState(workload = {}) {
  const score = (workload.activeCount || 0) + (workload.overdueCount || 0) * 2 + (workload.criticalCount || 0) * 2;
  if (score >= 8) return 'danger';
  if (score >= 4) return 'warning';
  return 'calm';
}

function loadLabel(state) {
  if (state === 'danger') return 'high';
  if (state === 'warning') return 'medium';
  return 'low';
}

function ServiceTicketCard({ request, active, onSelect }) {
  const status = request.serviceStatus || request.status;
  return (
    <button type="button" className={`ticket-card ${active ? 'active' : ''} ${!request.assignedToUserId ? 'unassigned' : ''}`} onClick={() => onSelect(request.id)}>
      <i className="ticket-strip" data-status={status} />
      <div className="ticket-top"><StatusBadge status={status}>{STATUS_LABELS[status] || status}</StatusBadge><small>#{request.id}</small></div>
      <strong>{request.client?.companyName || 'Клиент без названия'}</strong>
      <p>{request.equipment?.brand || '—'} {request.equipment?.model || ''}</p>
      <div className="ticket-tags">
        {!request.assignedToUserId ? <em className="danger">Без назначения</em> : <em>{request.assignedToUser?.fullName || request.assignedToUserId}</em>}
        <em>{request.urgency || 'normal'}</em>
      </div>
      <div className="ticket-meta"><span>🕒 {formatDate(request.updatedAt)}</span></div>
    </button>
  );
}

export function AdminServicePage() {
  const { user } = useAuth();
  const canAssign = [ROLES.serviceHead, ROLES.manager].includes(user?.role);
  const [filters, setFilters] = useState({ status: 'all', type: 'all', id: '', client: '', engineer: 'all', quickFilter: 'all', sort: 'urgency' });
  const [requests, setRequests] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [engineers, setEngineers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [assignmentHistory, setAssignmentHistory] = useState([]);
  const [assignForm, setAssignForm] = useState({ assignedToUserId: '', comment: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(next = filters) {
    setLoading(true);
    try {
      const [list, dash, engineerPayload] = await Promise.all([
        adminServiceApi.serviceCases({ ...next, serviceStatus: next.status === 'all' ? '' : next.status, assignedToUserId: next.engineer === 'all' ? '' : next.engineer, search: next.client || next.id || '' }),
        adminServiceApi.serviceDashboard(),
        canAssign ? adminServiceApi.serviceEngineers() : Promise.resolve({ engineers: [] }),
      ]);
      let scoped = list.items || [];
      if (next.quickFilter === 'unassigned') scoped = scoped.filter((item) => !item.assignedToUserId);
      setRequests(scoped);
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
    setAssignForm({ assignedToUserId: '', comment: '' });
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
    await adminServiceApi.updateCommercialStatus(equipmentId, toStatus);
    await load();
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

  const statusData = [
    { key: 'accepted', label: 'Принятые', value: dashboard?.newCount || 0 },
    { key: 'in_progress', label: 'В работе', value: dashboard?.inProgressCount || 0 },
    { key: 'testing', label: 'Тест', value: dashboard?.testingCount || 0 },
    { key: 'ready', label: 'Готово', value: dashboard?.readyCount || 0 },
    { key: 'processed', label: 'Проведено', value: dashboard?.processedCount || 0 },
  ];
  const statusMax = useChartMax(statusData);
  const dailyData = [];
  const dailyMax = useChartMax(dailyData);
  const engineerData = dashboard?.engineerLoad || [];
  const engineerMax = Math.max(...engineerData.map((i) => i.active + i.overdue), 1);
  const kpis = [
    { key: 'newCount', label: 'Принятые', value: dashboard?.newCount || 0 },
    { key: 'inProgressCount', label: 'В работе', value: dashboard?.inProgressCount || 0 },
    { key: 'testingCount', label: 'Тест', value: dashboard?.testingCount || 0 },
    { key: 'readyCount', label: 'Готово директору', value: dashboard?.readyCount || 0 },
    { key: 'processedCount', label: 'Проведено', value: dashboard?.processedCount || 0 },
    { key: 'overdueCount', label: 'Просроченные', value: dashboard?.overdueCount || 0 },
    { key: 'unassignedCount', label: 'Без назначения', value: dashboard?.unassignedCount || 0 },
  ];

  const filteredRequests = useMemo(() => requests.filter((item) => {
    if (filters.quickFilter === 'unassigned') return !item.assignedToUserId;
    if (filters.quickFilter === 'mine') return item.assignedToUserId === user?.id;
    if (filters.quickFilter?.startsWith('engineer:')) return item.assignedToUserId === filters.quickFilter.replace('engineer:', '');
    return true;
  }), [filters.quickFilter, requests, user?.id]);

  const selectedServiceStatus = selectedRequest?.serviceStatus || selectedRequest?.status;
  const selectedCommercialStatus = selectedRequest?.equipment?.commercialStatus || 'none';
  const serviceActions = (selectedRequest?.availableServiceActions || getAvailableServiceActions(user?.role, selectedServiceStatus));
  const commercialActions = (selectedRequest?.availableCommercialActions || getAvailableCommercialActions(user?.role, selectedServiceStatus, selectedCommercialStatus));

  return (
    <section className="service-dashboard">
      <header className="service-headline">
        <div><h2>Service Dashboard</h2><p>Распределение и контроль заявок сервисной команды.</p></div>
      </header>

      <div className="kpi-row">
        {kpis.map((item) => <KPIChipCard key={item.key} label={item.label} value={item.value} icon={KPI_ICON[item.key]} tone={item.key} hint={item.deltaLabel || 'Оперативно'} />)}
      </div>

      <AlertPanel items={[
        <li key="without_equipment"><span>Без оборудования</span><strong>{requests.filter((i) => !i.equipmentId).length}</strong></li>,
        <li key="unassigned"><span>Без назначения</span><strong>{dashboard?.unassignedCount || 0}</strong></li>,
        <li key="stuck"><span>Зависшие</span><strong>{dashboard?.overdueCount || 0}</strong></li>,
        <li key="critical"><span>Критические</span><strong>{requests.filter((i) => (i.priority || '').toLowerCase() === 'critical').length}</strong></li>,
      ]} />

      <FilterRow>
        <label><span>Статус</span><select value={filters.status} onChange={(e) => { const n = { ...filters, status: e.target.value }; setFilters(n); load(n); }}>{STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label><span>Приёмка</span><select value={filters.type} onChange={(e) => { const n = { ...filters, type: e.target.value }; setFilters(n); load(n); }}><option value="all">Все</option><option value="client_repair">Ремонт клиента</option><option value="after_rent">После аренды</option><option value="after_replacement">После подмены</option><option value="new_purchase">Новокупленное</option></select></label>
        <label><span>Быстрый фильтр</span><select value={filters.quickFilter} onChange={(e) => setFilters((prev) => ({ ...prev, quickFilter: e.target.value }))}><option value="all">Все</option><option value="unassigned">Без назначения</option><option value="mine">Мои</option>{engineers.map((eng) => <option key={eng.id} value={`engineer:${eng.id}`}>Инженер: {eng.fullName}</option>)}</select></label>
        <label><span>Инженер</span><select value={filters.engineer} onChange={(e) => { const n = { ...filters, engineer: e.target.value }; setFilters(n); load(n); }}><option value="all">Все инженеры</option>{(dashboard?.engineers || []).map((eng) => <option key={eng.userId} value={eng.userId}>{eng.name}</option>)}</select></label>
        <label><span>ID</span><input value={filters.id} onChange={(e) => setFilters((p) => ({ ...p, id: e.target.value }))} onBlur={() => load(filters)} placeholder="req-5001" /></label>
        <label><span>Клиент</span><input value={filters.client} onChange={(e) => setFilters((p) => ({ ...p, client: e.target.value }))} onBlur={() => load(filters)} placeholder="поиск" /></label>
        <label><span>Сортировка</span><select value={filters.sort} onChange={(e) => { const n = { ...filters, sort: e.target.value }; setFilters(n); load(n); }}>{SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      </FilterRow>

      <div className="quick-filter-row">
        <button type="button" className={filters.quickFilter === 'all' ? 'secondary active' : 'secondary'} onClick={() => { const n = { ...filters, quickFilter: 'all' }; setFilters(n); load(n); }}>Все</button>
        <button type="button" className={filters.quickFilter === 'unassigned' ? 'secondary active' : 'secondary'} onClick={() => { const n = { ...filters, quickFilter: 'unassigned' }; setFilters(n); load(n); }}>Без назначения</button>
        <button type="button" className={filters.quickFilter === 'mine' ? 'secondary active' : 'secondary'} onClick={() => { const n = { ...filters, quickFilter: 'mine' }; setFilters(n); load(n); }}>Мои</button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="service-workspace">
        <div className="ticket-board">
          {loading ? <p>Загрузка...</p> : null}
          {filteredRequests.map((request) => <ServiceTicketCard key={request.id} request={request} active={selectedId === request.id} onSelect={setSelectedId} />)}
        </div>
        <DetailPanel>
          {!selectedRequest ? <p>Выберите заявку в колонке слева.</p> : (
            <>
              <header><h3>Заявка #{selectedRequest.id}</h3><StatusBadge status={selectedServiceStatus}>{STATUS_LABELS[selectedServiceStatus] || selectedServiceStatus}</StatusBadge></header>
              <div className="detail-grid">
                <p><Icon name="clients" /> {selectedRequest.client?.companyName || '—'}</p>
                <p><Icon name="equipment" /> {selectedRequest.equipment?.brand || '—'} {selectedRequest.equipment?.model || ''}</p>
                <p><Icon name="employees" /> {selectedRequest.assignedToUser?.fullName || 'Не назначен'}</p>
                <p><Icon name="service" /> Назначил: {selectedRequest.assignedByUser?.fullName || '—'}</p>
              </div>
              <small>Назначено: {formatDate(selectedRequest.assignedAt)}</small>
              <small>Коммерческий статус: {COMMERCIAL_STATUS_LABELS[selectedCommercialStatus] || selectedCommercialStatus}</small>
              {serviceActions.length ? (
                <div className="assignment-box">
                  <h4>Действия по сервису</h4>
                  <div className="quick-filter-row">
                    {serviceActions.map((statusKey) => (
                      <button key={statusKey} type="button" onClick={() => applyServiceStatus(statusKey).catch(() => setError('Не удалось обновить сервисный статус.'))}>
                        → {STATUS_LABELS[statusKey] || statusKey}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {commercialActions.length ? (
                <div className="assignment-box">
                  <h4>Коммерческие действия</h4>
                  <div className="quick-filter-row">
                    {commercialActions.map((statusKey) => (
                      <button key={statusKey} type="button" onClick={() => applyCommercialStatus(statusKey).catch(() => setError('Не удалось обновить коммерческий статус.'))}>
                        → {COMMERCIAL_STATUS_LABELS[statusKey] || statusKey}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {canAssign ? (
                <div className="assignment-box">
                  <h4>{selectedRequest.assignedToUserId ? 'Переназначить инженера' : 'Назначить инженера'}</h4>
                  <select value={assignForm.assignedToUserId} onChange={(e) => setAssignForm((prev) => ({ ...prev, assignedToUserId: e.target.value }))}>
                    <option value="">Выберите инженера</option>
                    {engineers.filter((eng) => eng.isActive).map((eng) => <option key={eng.id} value={eng.id}>{eng.fullName} · активных {eng.workload?.activeCount || 0}</option>)}
                  </select>
                  <input value={assignForm.comment} onChange={(e) => setAssignForm((prev) => ({ ...prev, comment: e.target.value }))} maxLength={200} placeholder="Комментарий к назначению" />
                  <button type="button" onClick={() => submitAssignment().catch(() => setError('Не удалось назначить инженера.'))}>Сохранить назначение</button>
                </div>
              ) : null}
              <div className="assignment-history">
                <h4>История статусов</h4>
                {(assignmentHistory || []).map((item) => <p key={item.id}>[{formatDate(item.changedAt)}] {item.fromServiceStatus || item.fromStatusRaw || '—'} → {item.toServiceStatus || item.toStatusRaw} {item.comment ? `(${item.comment})` : ''}</p>)}
              </div>
            </>
          )}
        </DetailPanel>
      </div>

      <section className="metrics-grid">
        <ChartCard title="Загрузка инженеров">
          <WorkloadWidget items={engineers.map((item) => <CompactMetricCard key={item.id} label={item.fullName} value={`${item.workload?.activeCount || 0} акт / ${item.workload?.overdueCount || 0} проср`} progress={(((item.workload?.activeCount || 0) + (item.workload?.overdueCount || 0)) / Math.max(1, engineerMax)) * 100} state={loadState(item.workload)} />)} />
        </ChartCard>
        <ChartCard title="Распределение">
          <div className="bar-chart">
            <div><span>Без назначения</span><i style={{ width: barWidth(dashboard?.assignment?.unassignedCount || 0, Math.max(1, requests.length)) }} /><strong>{dashboard?.assignment?.unassignedCount || 0}</strong></div>
            <div><span>Перегружены</span><i style={{ width: barWidth((dashboard?.assignment?.overloadedEngineers || []).length, Math.max(1, engineers.length)) }} /><strong>{(dashboard?.assignment?.overloadedEngineers || []).length}</strong></div>
            <div><span>Свободны</span><i style={{ width: barWidth((dashboard?.assignment?.freeEngineers || []).length, Math.max(1, engineers.length)) }} /><strong>{(dashboard?.assignment?.freeEngineers || []).length}</strong></div>
          </div>
        </ChartCard>
        <ChartCard title="По статусам"><div className="bar-chart">{statusData.map((item) => <div key={item.key}><span>{item.label}</span><i style={{ width: barWidth(item.value, statusMax) }} /><strong>{item.value}</strong></div>)}</div></ChartCard>
        <ChartCard title="Динамика"><div className="line-fake">{dailyData.map((item) => <b key={item.key} style={{ height: barWidth(item.value, dailyMax) }} title={`${item.label}: ${item.value}`} />)}</div></ChartCard>
      </section>
    </section>
  );
}
