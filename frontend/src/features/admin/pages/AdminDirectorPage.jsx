import { useEffect, useMemo, useState } from 'react';
import { adminServiceApi } from '../api/adminServiceApi';
import { DetailPanel, Icon, KPIChipCard, StatusBadge } from '../components/AdminUi';

const BOARD_COLUMNS = ['ready', 'processed'];
const BOARD_LABELS = { ready: 'Ready', processed: 'Processed' };
const STATUS_LABELS = { ready: 'Готово', processed: 'Проведено', in_progress: 'В работе' };
const COMMERCIAL_LABELS = {
  none: 'Нет',
  ready_for_issue: 'Готово к выдаче',
  ready_for_rent: 'Готово к аренде',
  ready_for_sale: 'Готово к продаже',
};

function formatDate(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }

function DirectorCard({ item, active, onSelect }) {
  const status = item.serviceStatus;
  return (
    <button type="button" className={`ticket-card ${active ? 'active' : ''}`} onClick={() => onSelect(item.id)}>
      <i className="ticket-strip" data-status={status} />
      <div className="ticket-top"><StatusBadge status={status}>{STATUS_LABELS[status] || status}</StatusBadge><small>#{item.id}</small></div>
      <strong>{item.equipment?.clientName || 'Клиент'}</strong>
      <p>{item.equipment?.brand || '—'} {item.equipment?.model || ''}</p>
      <div className="ticket-meta"><span>🕒 {formatDate(item.updatedAt)}</span></div>
    </button>
  );
}

export function AdminDirectorPage() {
  const [requests, setRequests] = useState([]);
  const [kpi, setKpi] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceIssued, setInvoiceIssued] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const [list, dashboard] = await Promise.all([
        adminServiceApi.serviceCases({ serviceStatus: '' }),
        adminServiceApi.serviceKpi(),
      ]);
      const queue = (list.items || []).filter((i) => ['ready', 'processed'].includes(i.serviceStatus));
      setRequests(queue);
      setKpi(dashboard || {});
      setSelectedId((prev) => prev || queue[0]?.id || null);
      setError('');
    } catch {
      setError('Не удалось загрузить директорскую очередь.');
    }
  }

  async function loadDetails(id) {
    const payload = await adminServiceApi.serviceCaseById(id);
    const item = payload.item || null;
    setSelectedRequest(item);
    setInvoiceNumber(item?.invoiceNumber || '');
    setInvoiceIssued(Boolean(item?.invoiceIssued));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => {
    if (!selectedId) return setSelectedRequest(null);
    loadDetails(selectedId).catch(() => setSelectedRequest(null));
  }, [selectedId]);

  const boardColumns = useMemo(() => BOARD_COLUMNS.map((status) => ({
    status,
    label: BOARD_LABELS[status],
    items: requests.filter((item) => item.serviceStatus === status),
  })), [requests]);

  const commercialActions = (selectedRequest?.availableCommercialActions || [])
    .filter((status) => ['ready_for_issue', 'ready_for_rent', 'ready_for_sale'].includes(status));

  async function processCase(nextStatus) {
    if (!selectedId) return;
    await adminServiceApi.directorProcessServiceCase(selectedId, {
      serviceStatus: nextStatus,
      invoiceNumber: invoiceNumber.trim() || undefined,
      invoiceIssued,
    });
    await load();
    await loadDetails(selectedId);
  }

  async function applyCommercialRoute(nextStatus) {
    if (!selectedId) return;
    await adminServiceApi.directorCommercialRoute(selectedId, nextStatus);
    await loadDetails(selectedId);
  }

  return (
    <section className="service-dashboard">
      <header className="service-headline"><div><h2>Director Queue</h2><p>Ready/Processed handoff и выбор коммерческого маршрута.</p></div></header>
      <div className="kpi-row">
        <KPIChipCard label="Новых" value={kpi.newCount || 0} icon="dashboard" hint="Сервис" />
        <KPIChipCard label="В работе" value={kpi.inProgressCount || 0} icon="service" hint="Сервис" />
        <KPIChipCard label="Тест" value={kpi.testingCount || 0} icon="service" hint="Сервис" />
        <KPIChipCard label="Ready" value={kpi.readyCount || 0} icon="equipment" hint="Сервис" />
        <KPIChipCard label="Без назначения" value={kpi.unassignedCount || 0} icon="clients" hint="Сервис" />
        <KPIChipCard label="Просроченных" value={kpi.overdueCount || 0} icon="bell" hint="Сервис" />
        <KPIChipCard label="Закрыто сегодня" value={kpi.closedTodayCount || 0} icon="sales" hint="Сервис" />
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="service-workspace kanban-layout">
        <div className="kanban-board">
          {boardColumns.map((column) => (
            <section key={column.status} className="kanban-column">
              <header><h4>{column.label}</h4><strong>{column.items.length}</strong></header>
              <div className="kanban-cards">
                {column.items.map((item) => <DirectorCard key={item.id} item={item} active={selectedId === item.id} onSelect={setSelectedId} />)}
                {!column.items.length ? <p className="empty-copy">Пусто</p> : null}
              </div>
            </section>
          ))}
        </div>

        <DetailPanel>
          {!selectedRequest ? <p>Выберите кейс.</p> : (
            <>
              <header className="detail-header"><h3>Case #{selectedRequest.id}</h3><StatusBadge status={selectedRequest.serviceStatus}>{STATUS_LABELS[selectedRequest.serviceStatus] || selectedRequest.serviceStatus}</StatusBadge></header>
              <div className="detail-grid">
                <p><Icon name="clients" /> Клиент: {selectedRequest.equipment?.clientName || '—'}</p>
                <p><Icon name="service" /> processedAt: {formatDate(selectedRequest.processedAt)}</p>
                <p><Icon name="employees" /> processedBy: {selectedRequest.processedByUser?.fullName || '—'}</p>
                <p><Icon name="sales" /> Commercial: {COMMERCIAL_LABELS[selectedRequest.equipment?.commercialStatus || 'none'] || (selectedRequest.equipment?.commercialStatus || 'none')}</p>
              </div>

              <div className="assignment-box">
                <h4>Director actions</h4>
                <div className="quick-filter-row">
                  <button type="button" onClick={() => processCase('in_progress').catch(() => setError('Переход запрещен.'))}>Вернуть в in_progress</button>
                  <button type="button" onClick={() => processCase('processed').catch(() => setError('Переход запрещен.'))}>Перевести в processed</button>
                </div>
                <label><span>invoiceNumber</span><input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-2026-001" /></label>
                <label className="checkbox"><input type="checkbox" checked={invoiceIssued} onChange={(e) => setInvoiceIssued(e.target.checked)} /> invoiceIssued</label>
              </div>

              {selectedRequest.serviceStatus === 'processed' ? (
                <div className="assignment-box">
                  <h4>Commercial handoff</h4>
                  <div className="quick-filter-row">
                    {commercialActions.map((status) => (
                      <button key={status} type="button" onClick={() => applyCommercialRoute(status).catch(() => setError('Коммерческий переход запрещен.'))}>
                        → {COMMERCIAL_LABELS[status] || status}
                      </button>
                    ))}
                    {!commercialActions.length ? <p className="empty-copy">Нет доступных маршрутов.</p> : null}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </DetailPanel>
      </div>
    </section>
  );
}
