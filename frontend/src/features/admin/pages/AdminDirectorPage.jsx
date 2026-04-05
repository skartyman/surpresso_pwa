import { useEffect, useMemo, useState } from 'react';
import { adminServiceApi } from '../api/adminServiceApi';
import { DetailPanel, Icon, KPIChipCard, StatusBadge } from '../components/AdminUi';

const CASE_COLUMNS = ['ready'];
const COMMERCIAL_COLUMNS = ['ready_for_issue', 'ready_for_rent', 'ready_for_sale'];
const SERVICE_LABELS = { ready: 'Ready' };
const COMMERCIAL_LABELS = {
  ready_for_issue: 'Ready for issue',
  ready_for_rent: 'Ready for rent',
  ready_for_sale: 'Ready for sale',
};

function formatDate(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }

function DirectorCard({ item, active, onSelect }) {
  return (
    <button type="button" className={`ticket-card ${active ? 'active' : ''}`} onClick={() => onSelect(item.id)}>
      <i className="ticket-strip" data-status={item.serviceStatus} />
      <div className="ticket-top"><StatusBadge status={item.serviceStatus}>{item.serviceStatus}</StatusBadge><small>#{item.id}</small></div>
      <strong>{item.equipment?.clientName || 'Клиент'}</strong>
      <p>{item.equipment?.brand || '—'} {item.equipment?.model || ''}</p>
      <div className="ticket-meta"><span>🕒 {formatDate(item.updatedAt)}</span></div>
    </button>
  );
}

function RouteCard({ item, active, onSelect }) {
  return (
    <button type="button" className={`ticket-card ${active ? 'active' : ''}`} onClick={() => onSelect(item.id)}>
      <i className="ticket-strip" data-status={item.commercialStatus} />
      <div className="ticket-top"><StatusBadge status={item.commercialStatus}>{item.commercialStatus}</StatusBadge><small>{item.id}</small></div>
      <strong>{item.clientName || 'Клиент'}</strong>
      <p>{item.brand || '—'} {item.model || ''}</p>
      <div className="ticket-meta"><span>🕒 {formatDate(item.updatedAt)}</span></div>
    </button>
  );
}

export function AdminDirectorPage() {
  const [serviceCases, setServiceCases] = useState([]);
  const [commercialQueue, setCommercialQueue] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [selectedCommercialId, setSelectedCommercialId] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceIssued, setInvoiceIssued] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const payload = await adminServiceApi.directorQueue();
      const nextCases = payload.serviceCases || [];
      const nextCommercial = payload.commercialQueue || [];
      setServiceCases(nextCases);
      setCommercialQueue(nextCommercial);
      setSelectedCaseId((prev) => prev || nextCases[0]?.id || null);
      setSelectedCommercialId((prev) => prev || nextCommercial[0]?.id || null);
      setError('');
    } catch {
      setError('Не удалось загрузить director queue.');
    }
  }

  async function loadCaseDetails(id) {
    const payload = await adminServiceApi.serviceCaseById(id);
    const item = payload.item || null;
    setSelectedCase(item);
    setInvoiceNumber(item?.invoiceNumber || '');
    setInvoiceIssued(Boolean(item?.invoiceIssued));
  }

  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => {
    if (!selectedCaseId) return setSelectedCase(null);
    loadCaseDetails(selectedCaseId).catch(() => setSelectedCase(null));
  }, [selectedCaseId]);

  const serviceColumns = useMemo(() => CASE_COLUMNS.map((status) => ({
    status,
    label: SERVICE_LABELS[status] || status,
    items: serviceCases.filter((item) => item.serviceStatus === status),
  })), [serviceCases]);

  const commercialColumns = useMemo(() => COMMERCIAL_COLUMNS.map((status) => ({
    status,
    label: COMMERCIAL_LABELS[status],
    items: commercialQueue.filter((item) => item.commercialStatus === status),
  })), [commercialQueue]);

  const actions = selectedCase?.nextActions?.all || [];
  const processActions = actions.filter((action) => action.key === 'process' && action.type === 'service');
  const routeActions = actions.filter((action) => action.type === 'commercial' && action.key.startsWith('route_to_'));

  async function processCase(nextStatus) {
    if (!selectedCaseId || !nextStatus) return;
    await adminServiceApi.directorProcessServiceCase(selectedCaseId, {
      serviceStatus: nextStatus,
      invoiceNumber: invoiceNumber.trim() || undefined,
      invoiceIssued,
    });
    await load();
    await loadCaseDetails(selectedCaseId);
  }

  async function applyCommercialRoute(nextStatus) {
    if (!selectedCaseId || !nextStatus) return;
    await adminServiceApi.directorCommercialRoute(selectedCaseId, nextStatus);
    await load();
    await loadCaseDetails(selectedCaseId);
  }

  return (
    <section className="service-dashboard">
      <header className="service-headline"><div><h2>Director Queue</h2><p>Role-driven workflow: process + route to issue/rent/sale.</p></div></header>
      <div className="kpi-row">
        <KPIChipCard label="Ready service cases" value={serviceColumns.reduce((acc, col) => acc + col.items.length, 0)} icon="service" hint="Director" />
        <KPIChipCard label="Ready for issue" value={commercialColumns.find((c) => c.status === 'ready_for_issue')?.items.length || 0} icon="equipment" hint="Commercial" />
        <KPIChipCard label="Ready for rent" value={commercialColumns.find((c) => c.status === 'ready_for_rent')?.items.length || 0} icon="sales" hint="Commercial" />
        <KPIChipCard label="Ready for sale" value={commercialColumns.find((c) => c.status === 'ready_for_sale')?.items.length || 0} icon="sales" hint="Commercial" />
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="service-workspace kanban-layout">
        <div className="kanban-board">
          {serviceColumns.map((column) => (
            <section key={column.status} className="kanban-column">
              <header><h4>{column.label}</h4><strong>{column.items.length}</strong></header>
              <div className="kanban-cards">
                {column.items.map((item) => <DirectorCard key={item.id} item={item} active={selectedCaseId === item.id} onSelect={setSelectedCaseId} />)}
                {!column.items.length ? <p className="empty-copy">Пусто</p> : null}
              </div>
            </section>
          ))}

          {commercialColumns.map((column) => (
            <section key={column.status} className="kanban-column">
              <header><h4>{column.label}</h4><strong>{column.items.length}</strong></header>
              <div className="kanban-cards">
                {column.items.map((item) => <RouteCard key={item.id} item={item} active={selectedCommercialId === item.id} onSelect={setSelectedCommercialId} />)}
                {!column.items.length ? <p className="empty-copy">Пусто</p> : null}
              </div>
            </section>
          ))}
        </div>

        <DetailPanel>
          {!selectedCase ? <p>Выберите кейс.</p> : (
            <>
              <header className="detail-header"><h3>Case #{selectedCase.id}</h3><StatusBadge status={selectedCase.serviceStatus}>{selectedCase.serviceStatus}</StatusBadge></header>
              <div className="detail-grid">
                <p><Icon name="clients" /> Клиент: {selectedCase.equipment?.clientName || '—'}</p>
                <p><Icon name="service" /> Обновлено: {formatDate(selectedCase.updatedAt)}</p>
                <p><Icon name="employees" /> Исполнитель: {selectedCase.assignedToUser?.fullName || '—'}</p>
                <p><Icon name="sales" /> Коммерция: {selectedCase.equipment?.commercialStatus || 'none'}</p>
              </div>

              <div className="assignment-box">
                <h4>Process</h4>
                <label><span>invoiceNumber</span><input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-2026-001" /></label>
                <label className="checkbox"><input type="checkbox" checked={invoiceIssued} onChange={(e) => setInvoiceIssued(e.target.checked)} /> invoiceIssued</label>
                <div className="quick-filter-row">
                  {processActions.map((action) => (
                    <button key={action.key + action.targetStatus} type="button" onClick={() => processCase(action.targetStatus).catch(() => setError('Переход запрещен.'))}>
                      {action.label}
                    </button>
                  ))}
                  {!processActions.length ? <p className="empty-copy">Нет доступных действий.</p> : null}
                </div>
              </div>

              <div className="assignment-box">
                <h4>Route</h4>
                <div className="quick-filter-row">
                  {routeActions.map((action) => (
                    <button key={action.key} type="button" onClick={() => applyCommercialRoute(action.targetStatus).catch(() => setError('Коммерческий переход запрещен.'))}>
                      {action.label}
                    </button>
                  ))}
                  {!routeActions.length ? <p className="empty-copy">Нет доступных маршрутов.</p> : null}
                </div>
              </div>
            </>
          )}
        </DetailPanel>
      </div>
    </section>
  );
}
