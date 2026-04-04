import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { adminServiceApi } from '../api/adminServiceApi';
import { ROLES } from '../roleConfig';
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
const STATUS_LABELS = { new: 'Новая', in_progress: 'В работе', waiting_client: 'Ждёт клиента', waiting_parts: 'Ждёт запчасти', resolved: 'Решена', closed: 'Закрыта', overdue: 'Просрочена' };
const KPI_ICON = { new: 'dashboard', in_progress: 'service', overdue: 'bell', unassigned: 'clients', waiting_parts: 'equipment', closed_today: 'sales' };

function formatDate(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }
function barWidth(v, max) { return `${Math.max(6, Math.round((v / (max || 1)) * 100))}%`; }

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
  const photos = (request.media || []).filter((item) => item.kind === 'photo').length;
  const videos = (request.media || []).filter((item) => item.kind === 'video').length;
  return (
    <button type="button" className={`ticket-card ${active ? 'active' : ''} ${!request.assignedToUserId ? 'is-unassigned' : ''}`} onClick={() => onSelect(request.id)}>
      <i className="ticket-strip" data-status={request.status} />
      <div className="ticket-top"><StatusBadge status={request.status}>{STATUS_LABELS[request.status] || request.status}</StatusBadge><small>#{request.id}</small></div>
      <strong>{request.client?.companyName || 'Клиент без названия'}</strong>
      <p>{request.equipment?.brand || '—'} {request.equipment?.model || ''}</p>
      <div className="ticket-tags">
        {!request.assignedToUserId ? <em className="danger">Без назначения</em> : <em>{request.assignedToUser?.fullName || request.assignedToUserId}</em>}
        <em>{request.urgency || 'normal'}</em>
        {request.status === 'overdue' ? <em className="danger">Просрочена</em> : null}
      </div>
      <div className="ticket-meta"><span>🕒 {formatDate(request.updatedAt)}</span><span>📷 {photos}</span><span>🎥 {videos}</span><span>💬 {request.commentCount || 0}</span></div>
    </button>
  );
}

export function AdminServicePage() {
  const { user } = useAuth();
  const canAssign = [ROLES.serviceHead, ROLES.manager].includes(user?.role);
  const canSeeGlobal = [ROLES.serviceHead, ROLES.owner, ROLES.director, ROLES.manager].includes(user?.role);
  const [filters, setFilters] = useState({ status: 'all', type: 'all', id: '', client: '', equipment: '', engineer: 'all', quickFilter: 'all', sort: 'urgency' });
  const [requests, setRequests] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [engineers, setEngineers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [assignmentHistory, setAssignmentHistory] = useState([]);
  const [selectedEngineerId, setSelectedEngineerId] = useState('');
  const [assignmentComment, setAssignmentComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(next = filters) {
    setLoading(true);
    try {
      const engineerFilter = next.quickFilter === 'mine' ? user?.id : (next.engineer === 'all' ? '' : next.engineer);
      const [list, dash, engineersPayload] = await Promise.all([
        adminServiceApi.list({ ...next, status: next.status === 'all' ? '' : next.status, type: next.type === 'all' ? '' : next.type, engineer: engineerFilter }),
        adminServiceApi.dashboard({ status: next.status === 'all' ? '' : next.status, type: next.type === 'all' ? '' : next.type, engineer: engineerFilter }),
        adminServiceApi.serviceEngineers().catch(() => ({ engineers: [] })),
      ]);
      let scoped = list.requests || [];
      if (next.quickFilter === 'unassigned') scoped = scoped.filter((item) => !item.assignedToUserId);
      setRequests(scoped);
      setDashboard(dash || null);
      setEngineers(engineersPayload?.engineers || []);
      setSelectedId((prev) => prev || scoped?.[0]?.id || null);
      setError('');
    } catch {
      setError('Не удалось загрузить сервисный дашборд.');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => {
    if (!selectedId) {
      setSelectedRequest(null);
      setAssignmentHistory([]);
      return;
    }
    Promise.all([
      adminServiceApi.byId(selectedId),
      adminServiceApi.assignmentHistory(selectedId).catch(() => ({ history: [] })),
    ])
      .then(([payload, historyPayload]) => {
        setSelectedRequest(payload.request || null);
        setAssignmentHistory(historyPayload.history || []);
        setSelectedEngineerId(payload.request?.assignedToUserId || '');
      })
      .catch(() => {
        setSelectedRequest(null);
        setAssignmentHistory([]);
      });
  }, [selectedId]);

  const statusData = dashboard?.analytics?.statuses || [];
  const statusMax = useChartMax(statusData);
  const dailyData = dashboard?.analytics?.daily || [];
  const dailyMax = useChartMax(dailyData);
  const engineerData = dashboard?.engineerLoad || [];
  const engineerMax = Math.max(...engineerData.map((i) => i.active + i.overdue), 1);
  const kpis = dashboard?.kpis || [];

  const engineersById = useMemo(() => Object.fromEntries(engineers.map((item) => [item.id, item])), [engineers]);

  async function onAssign() {
    if (!selectedRequest || !selectedEngineerId) return;
    try {
      await adminServiceApi.assignManager(selectedRequest.id, selectedEngineerId, assignmentComment);
      setAssignmentComment('');
      await load(filters);
      const payload = await adminServiceApi.byId(selectedRequest.id);
      setSelectedRequest(payload.request || null);
      const hist = await adminServiceApi.assignmentHistory(selectedRequest.id).catch(() => ({ history: [] }));
      setAssignmentHistory(hist.history || []);
    } catch {
      setError('Не удалось назначить инженера. Проверьте права или параметры.');
    }
  }

  return (
    <section className="service-dashboard">
      <header className="service-headline">
        <div><h2>Service Dashboard</h2><p>Компактная операционная панель в фирменном стиле Surpresso.</p></div>
        <div className="quick-tags"><span>Board</span><span>Analytics</span><span>Workload</span></div>
      </header>

      <div className="kpi-row">
        {kpis.map((item) => <KPIChipCard key={item.key} label={item.label} value={item.value} icon={KPI_ICON[item.key]} tone={item.key} hint={item.deltaLabel || 'Оперативно'} />)}
      </div>

      <AlertPanel items={(dashboard?.attention || []).map((item) => <li key={item.key}><span>{item.label}</span><strong>{item.value}</strong></li>)} />

      <FilterRow>
        <label><span>Статус</span><select name="status" value={filters.status} onChange={(e) => { const n = { ...filters, status: e.target.value }; setFilters(n); load(n); }}>{STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label><span>Тип</span><select name="type" value={filters.type} onChange={(e) => { const n = { ...filters, type: e.target.value }; setFilters(n); load(n); }}>{TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label><span>Инженер</span><select name="engineer" value={filters.engineer} onChange={(e) => { const n = { ...filters, engineer: e.target.value }; setFilters(n); load(n); }}><option value="all">Все инженеры</option>{engineers.map((eng) => <option key={eng.id} value={eng.id}>{eng.fullName}</option>)}</select></label>
        <label><span>ID</span><input name="id" value={filters.id} onChange={(e) => setFilters((p) => ({ ...p, id: e.target.value }))} onBlur={() => load(filters)} placeholder="req-5001" /></label>
        <label><span>Клиент</span><input name="client" value={filters.client} onChange={(e) => setFilters((p) => ({ ...p, client: e.target.value }))} onBlur={() => load(filters)} placeholder="поиск" /></label>
        <label><span>Сортировка</span><select name="sort" value={filters.sort} onChange={(e) => { const n = { ...filters, sort: e.target.value }; setFilters(n); load(n); }}>{SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
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
          {requests.map((request) => <ServiceTicketCard key={request.id} request={request} active={selectedId === request.id} onSelect={setSelectedId} />)}
        </div>
        <DetailPanel>
          {!selectedRequest ? <p>Выберите заявку в колонке слева.</p> : (
            <>
              <header><h3>Заявка #{selectedRequest.id}</h3><StatusBadge status={selectedRequest.status}>{STATUS_LABELS[selectedRequest.status] || selectedRequest.status}</StatusBadge></header>
              <div className="detail-grid">
                <p><Icon name="clients" /> {selectedRequest.client?.companyName || '—'}</p>
                <p><Icon name="equipment" /> {selectedRequest.equipment?.brand || '—'} {selectedRequest.equipment?.model || ''}</p>
                <p><Icon name="employees" /> {selectedRequest.assignedToUser?.fullName || 'Не назначен'}</p>
                <p><Icon name="service" /> SLA: {selectedRequest.slaHours || '—'} ч</p>
                <p><Icon name="employees" /> Назначил: {selectedRequest.assignedByUser?.fullName || '—'}</p>
                <p><Icon name="dashboard" /> Назначено: {formatDate(selectedRequest.assignedAt)}</p>
              </div>
              <p>{selectedRequest.description || 'Описание не добавлено.'}</p>
              <small>Создана: {formatDate(selectedRequest.createdAt)} · Обновлена: {formatDate(selectedRequest.updatedAt)}</small>

              <section className="assignment-card">
                <h4>Инженер</h4>
                <p>Текущий: <strong>{selectedRequest.assignedToUser?.fullName || 'Не назначен'}</strong></p>
                {canAssign ? (
                  <>
                    <label>
                      <span>Выбор инженера</span>
                      <select value={selectedEngineerId} onChange={(e) => setSelectedEngineerId(e.target.value)}>
                        <option value="">Выберите инженера</option>
                        {engineers.map((eng) => {
                          const state = getLoadState(eng.workload);
                          return <option key={eng.id} value={eng.id}>{eng.fullName} · {loadLabel(state)} load · {eng.workload?.activeCount || 0} активных</option>;
                        })}
                      </select>
                    </label>
                    <label>
                      <span>Комментарий</span>
                      <input value={assignmentComment} onChange={(e) => setAssignmentComment(e.target.value)} placeholder="Короткий комментарий" />
                    </label>
                    <button type="button" onClick={onAssign}>{selectedRequest.assignedToUserId ? 'Переназначить' : 'Назначить инженера'}</button>
                  </>
                ) : null}
              </section>

              <section className="assignment-history">
                <h4>История назначений</h4>
                {!assignmentHistory.length ? <p>История пока пустая.</p> : (
                  <ul>
                    {assignmentHistory.map((item) => (
                      <li key={item.id}>
                        <strong>{item.fromUser?.fullName || 'Не назначен'} → {item.toUser?.fullName || item.toUserId}</strong>
                        <span>{formatDate(item.createdAt)} · назначил {item.assignedByUser?.fullName || item.assignedByUserId}</span>
                        {item.comment ? <em>{item.comment}</em> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </DetailPanel>
      </div>

      <section className="metrics-grid">
        <ChartCard title="Загрузка инженеров">
          <WorkloadWidget items={engineers.map((item) => {
            const state = getLoadState(item.workload);
            const total = (item.workload?.activeCount || 0) + (item.workload?.overdueCount || 0);
            return (
              <CompactMetricCard
                key={item.id}
                label={`${item.fullName} (${loadLabel(state)})`}
                value={`${item.workload?.activeCount || 0} акт / ${item.workload?.overdueCount || 0} проср / ${item.workload?.criticalCount || 0} крит`}
                progress={(total / Math.max(engineerMax, 1)) * 100}
                state={state === 'danger' ? 'danger' : state === 'warning' ? 'warning' : 'normal'}
              />
            );
          })} />
        </ChartCard>
        <ChartCard title="Заявки по статусам">
          <div className="bar-chart">{statusData.map((item) => <div key={item.key}><span>{item.label}</span><i style={{ width: barWidth(item.value, statusMax) }} /><strong>{item.value}</strong></div>)}</div>
        </ChartCard>
        <ChartCard title="Динамика по дням">
          <div className="line-fake">{dailyData.map((item) => <b key={item.key} style={{ height: barWidth(item.value, dailyMax) }} title={`${item.label}: ${item.value}`} />)}</div>
        </ChartCard>
        <ChartCard title="Состояние команды">
          <div className="team-blocks">
            <div><span>Без назначения</span><strong>{dashboard?.attention?.find((item) => item.key === 'unassigned')?.value || 0}</strong></div>
            <div><span>Перегруженные</span><strong>{engineers.filter((item) => getLoadState(item.workload) === 'danger').length}</strong></div>
            <div><span>Свободные</span><strong>{engineers.filter((item) => (item.workload?.activeCount || 0) === 0).length}</strong></div>
            <div><span>Всего инженеров</span><strong>{engineers.length}</strong></div>
          </div>
        </ChartCard>
        {canSeeGlobal ? <ChartCard title="Типы техники"><div className="bar-chart">{(dashboard?.analytics?.equipmentTypes || []).map((item) => <div key={item.key}><span>{item.label}</span><i style={{ width: barWidth(item.value, Math.max(...(dashboard?.analytics?.equipmentTypes || []).map((s) => s.value), 1)) }} /><strong>{item.value}</strong></div>)}</div></ChartCard> : null}
      </section>
    </section>
  );
}
