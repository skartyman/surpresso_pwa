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

function ServiceTicketCard({ request, active, onSelect }) {
  const photos = (request.media || []).filter((item) => item.kind === 'photo').length;
  const videos = (request.media || []).filter((item) => item.kind === 'video').length;
  return (
    <button type="button" className={`ticket-card ${active ? 'active' : ''}`} onClick={() => onSelect(request.id)}>
      <i className="ticket-strip" data-status={request.status} />
      <div className="ticket-top"><StatusBadge status={request.status}>{STATUS_LABELS[request.status] || request.status}</StatusBadge><small>#{request.id}</small></div>
      <strong>{request.client?.companyName || 'Клиент без названия'}</strong>
      <p>{request.equipment?.brand || '—'} {request.equipment?.model || ''}</p>
      <div className="ticket-tags">
        {!request.assignedToUserId ? <em className="danger">Без назначения</em> : <em>{request.assignedToUserId}</em>}
        <em>{request.urgency || 'normal'}</em>
        {request.status === 'overdue' ? <em className="danger">Просрочена</em> : null}
      </div>
      <div className="ticket-meta"><span>🕒 {formatDate(request.updatedAt)}</span><span>📷 {photos}</span><span>🎥 {videos}</span><span>💬 {request.commentCount || 0}</span></div>
    </button>
  );
}

export function AdminServicePage() {
  const { user } = useAuth();
  const canSeeGlobal = [ROLES.serviceHead, ROLES.owner, ROLES.director, ROLES.manager].includes(user?.role);
  const [filters, setFilters] = useState({ status: 'all', type: 'all', id: '', client: '', equipment: '', engineer: 'all', sort: 'urgency' });
  const [requests, setRequests] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(next = filters) {
    setLoading(true);
    try {
      const [list, dash] = await Promise.all([
        adminServiceApi.list({ ...next, status: next.status === 'all' ? '' : next.status, type: next.type === 'all' ? '' : next.type, engineer: next.engineer === 'all' ? '' : next.engineer }),
        adminServiceApi.dashboard({ status: next.status === 'all' ? '' : next.status, type: next.type === 'all' ? '' : next.type, engineer: next.engineer === 'all' ? '' : next.engineer }),
      ]);
      setRequests(list.requests || []);
      setDashboard(dash || null);
      setSelectedId((prev) => prev || list.requests?.[0]?.id || null);
      setError('');
    } catch {
      setError('Не удалось загрузить сервисный дашборд.');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => {
    if (!selectedId) return setSelectedRequest(null);
    adminServiceApi.byId(selectedId).then((payload) => setSelectedRequest(payload.request || null)).catch(() => setSelectedRequest(null));
  }, [selectedId]);

  const statusData = dashboard?.analytics?.statuses || [];
  const statusMax = useChartMax(statusData);
  const dailyData = dashboard?.analytics?.daily || [];
  const dailyMax = useChartMax(dailyData);
  const engineerData = dashboard?.engineerLoad || [];
  const engineerMax = Math.max(...engineerData.map((i) => i.active + i.overdue), 1);

  const kpis = dashboard?.kpis || [];

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
        <label><span>Инженер</span><select name="engineer" value={filters.engineer} onChange={(e) => { const n = { ...filters, engineer: e.target.value }; setFilters(n); load(n); }}><option value="all">Все инженеры</option>{(dashboard?.engineers || []).map((eng) => <option key={eng.userId} value={eng.userId}>{eng.name}</option>)}</select></label>
        <label><span>ID</span><input name="id" value={filters.id} onChange={(e) => setFilters((p) => ({ ...p, id: e.target.value }))} onBlur={() => load(filters)} placeholder="req-5001" /></label>
        <label><span>Клиент</span><input name="client" value={filters.client} onChange={(e) => setFilters((p) => ({ ...p, client: e.target.value }))} onBlur={() => load(filters)} placeholder="поиск" /></label>
        <label><span>Сортировка</span><select name="sort" value={filters.sort} onChange={(e) => { const n = { ...filters, sort: e.target.value }; setFilters(n); load(n); }}>{SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      </FilterRow>

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
                <p><Icon name="employees" /> {selectedRequest.assignedToUserId || 'Без назначения'}</p>
                <p><Icon name="service" /> SLA: {selectedRequest.slaHours || '—'} ч</p>
              </div>
              <p>{selectedRequest.description || 'Описание не добавлено.'}</p>
              <small>Создана: {formatDate(selectedRequest.createdAt)} · Обновлена: {formatDate(selectedRequest.updatedAt)}</small>
            </>
          )}
        </DetailPanel>
      </div>

      <section className="metrics-grid">
        <ChartCard title="Загрузка инженеров">
          <WorkloadWidget items={engineerData.map((item) => <CompactMetricCard key={item.userId} label={item.name} value={`${item.active} акт / ${item.overdue} проср`} progress={((item.active + item.overdue) / engineerMax) * 100} state={item.overdue > 1 ? 'warning' : 'normal'} />)} />
        </ChartCard>
        <ChartCard title="Заявки по статусам">
          <div className="bar-chart">{statusData.map((item) => <div key={item.key}><span>{item.label}</span><i style={{ width: barWidth(item.value, statusMax) }} /><strong>{item.value}</strong></div>)}</div>
        </ChartCard>
        <ChartCard title="Динамика по дням">
          <div className="line-fake">{dailyData.map((item) => <b key={item.key} style={{ height: barWidth(item.value, dailyMax) }} title={`${item.label}: ${item.value}`} />)}</div>
        </ChartCard>
        {canSeeGlobal ? <ChartCard title="Типы техники"><div className="bar-chart">{(dashboard?.analytics?.equipmentTypes || []).map((item) => <div key={item.key}><span>{item.label}</span><i style={{ width: barWidth(item.value, Math.max(...(dashboard?.analytics?.equipmentTypes || []).map((s) => s.value), 1)) }} /><strong>{item.value}</strong></div>)}</div></ChartCard> : null}
      </section>
    </section>
  );
}
