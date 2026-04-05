import { useEffect, useMemo, useState } from 'react';
import { adminServiceApi } from '../api/adminServiceApi';
import { AlertPanel, DetailPanel, Icon, KPIChipCard, OpsBoardCard, StatusBadge } from '../components/AdminUi';

const CASE_COLUMNS = ['ready', 'processed'];
const COMMERCIAL_COLUMNS = ['ready_for_issue', 'ready_for_rent', 'ready_for_sale'];
const SERVICE_LABELS = { ready: 'Ready', processed: 'Processed' };
const COMMERCIAL_LABELS = {
  ready_for_issue: 'Ready for issue',
  ready_for_rent: 'Ready for rent',
  ready_for_sale: 'Ready for sale',
};

function formatDate(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }

function DirectorCard({ item, active, onSelect }) {
  const warnings = [];
  if (!item.assignedToUserId) warnings.push('Unassigned');
  if (!item.equipmentId) warnings.push('No equipment');
  if (item.serviceStatus === 'ready' && (Date.now() - new Date(item.updatedAt).getTime()) > 24 * 3600000) warnings.push('Ready too long');

  return (
    <OpsBoardCard
      item={item}
      id={item.id}
      status={item.serviceStatus}
      statusLabel={item.serviceStatus}
      title={item.equipment?.clientName || 'Клиент'}
      subtitle={`${item.equipment?.brand || '—'} ${item.equipment?.model || ''} · ${item.equipment?.internalNumber || '—'} / ${item.equipment?.serial || '—'}`}
      ownerType={`owner: ${item.equipment?.ownerType || '—'}`}
      intakeType={`intake: ${item.intakeType || '—'}`}
      assignedMaster={item.assignedToUser?.fullName || 'Мастер: не назначен'}
      serviceStatus={item.serviceStatus}
      commercialStatus={item.equipment?.commercialStatus || 'none'}
      updatedAt={formatDate(item.updatedAt)}
      warnings={warnings}
      active={active}
      onSelect={onSelect}
    />
  );
}

function RouteCard({ item, active, onSelect }) {
  const warnings = [];
  if (!item.serial) warnings.push('No serial');
  return (
    <OpsBoardCard
      item={item}
      id={item.id}
      status={item.commercialStatus}
      statusLabel={item.commercialStatus}
      title={item.clientName || 'Клиент'}
      subtitle={`${item.brand || '—'} ${item.model || ''} · ${item.internalNumber || '—'} / ${item.serial || '—'}`}
      ownerType={`owner: ${item.ownerType || '—'}`}
      intakeType={`intake: ${item.intakeType || '—'}`}
      assignedMaster={item.assignedToUser?.fullName || 'Мастер: —'}
      serviceStatus={item.serviceStatus || '—'}
      commercialStatus={item.commercialStatus || 'none'}
      updatedAt={formatDate(item.updatedAt)}
      warnings={warnings}
      active={active}
      onSelect={onSelect}
    />
  );
}

export function AdminDirectorPage() {
  const [serviceCases, setServiceCases] = useState([]);
  const [commercialQueue, setCommercialQueue] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceIssued, setInvoiceIssued] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const payload = await adminServiceApi.directorQueue();
      const nextCases = payload.serviceCases || [];
      const nextCommercial = payload.commercialQueue || [];
      setServiceCases(nextCases);
      setCommercialQueue(nextCommercial);
      setSelectedCaseId((prev) => prev || nextCases[0]?.id || null);
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
    setActionLoading(`process:${nextStatus}`);
    await adminServiceApi.directorProcessServiceCase(selectedCaseId, {
      serviceStatus: nextStatus,
      invoiceNumber: invoiceNumber.trim() || undefined,
      invoiceIssued,
    });
    await load();
    await loadCaseDetails(selectedCaseId);
    setFeedback('Кейс проведен.');
    setActionLoading('');
  }

  async function applyCommercialRoute(nextStatus) {
    if (!selectedCaseId || !nextStatus) return;
    setActionLoading(`route:${nextStatus}`);
    await adminServiceApi.directorCommercialRoute(selectedCaseId, nextStatus);
    await load();
    await loadCaseDetails(selectedCaseId);
    setFeedback('Маршрут обновлен.');
    setActionLoading('');
  }

  const attention = {
    unassigned: serviceCases.filter((item) => !item.assignedToUserId).length,
    noEquipment: serviceCases.filter((item) => !item.equipmentId).length,
    staleInProgress: serviceCases.filter((item) => item.serviceStatus === 'in_progress' && (Date.now() - new Date(item.updatedAt).getTime()) > 48 * 3600000).length,
    readyTooLong: serviceCases.filter((item) => item.serviceStatus === 'ready' && (Date.now() - new Date(item.updatedAt).getTime()) > 24 * 3600000).length,
    rentSaleBacklog: commercialQueue.filter((item) => ['ready_for_rent', 'ready_for_sale'].includes(item.commercialStatus)).length,
  };

  return (
    <section className="service-dashboard">
      <header className="service-headline"><div><h2>Director Queue</h2><p>Operational routing board for director decisions.</p></div></header>
      <div className="kpi-row">
        <KPIChipCard label="Ready" value={serviceColumns.find((c) => c.status === 'ready')?.items.length || 0} icon="service" hint="Service" />
        <KPIChipCard label="Processed" value={serviceColumns.find((c) => c.status === 'processed')?.items.length || 0} icon="dashboard" hint="Service" />
        <KPIChipCard label="Ready for issue" value={commercialColumns.find((c) => c.status === 'ready_for_issue')?.items.length || 0} icon="equipment" hint="Commercial" />
        <KPIChipCard label="Ready for rent" value={commercialColumns.find((c) => c.status === 'ready_for_rent')?.items.length || 0} icon="sales" hint="Commercial" />
        <KPIChipCard label="Ready for sale" value={commercialColumns.find((c) => c.status === 'ready_for_sale')?.items.length || 0} icon="sales" hint="Commercial" />
      </div>

      <AlertPanel items={[
        <li key="unassigned"><span>Unassigned</span><strong>{attention.unassigned}</strong></li>,
        <li key="equipment"><span>No equipment data</span><strong>{attention.noEquipment}</strong></li>,
        <li key="stale"><span>Stale in progress</span><strong>{attention.staleInProgress}</strong></li>,
        <li key="ready"><span>Ready too long</span><strong>{attention.readyTooLong}</strong></li>,
        <li key="backlog"><span>Rent/sale backlog</span><strong>{attention.rentSaleBacklog}</strong></li>,
      ]} />

      {error ? <p className="error-text">{error}</p> : null}
      {feedback ? <p>{feedback}</p> : null}

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
                {column.items.map((item) => <RouteCard key={item.id} item={item} active={selectedCaseId === item.id} onSelect={setSelectedCaseId} />)}
                {!column.items.length ? <p className="empty-copy">Пусто</p> : null}
              </div>
            </section>
          ))}
        </div>

        <DetailPanel>
          {!selectedCase ? <p>Выберите кейс.</p> : (
            <>
              <header className="detail-header"><h3>Case #{selectedCase.id}</h3><StatusBadge status={selectedCase.serviceStatus}>{selectedCase.serviceStatus}</StatusBadge></header>
              <div className="detail-split">
                <div className="detail-grid">
                  <p><Icon name="clients" /> Клиент: {selectedCase.equipment?.clientName || '—'}</p>
                  <p><Icon name="equipment" /> Оборудование: {selectedCase.equipment?.brand || '—'} {selectedCase.equipment?.model || ''}</p>
                  <p><Icon name="equipment" /> Internal/Serial: {selectedCase.equipment?.internalNumber || '—'} / {selectedCase.equipment?.serial || '—'}</p>
                  <p><Icon name="employees" /> Исполнитель: {selectedCase.assignedToUser?.fullName || '—'}</p>
                  <p><Icon name="sales" /> Коммерция: {selectedCase.equipment?.commercialStatus || 'none'}</p>
                  <p><Icon name="service" /> Обновлено: {formatDate(selectedCase.updatedAt)}</p>
                </div>
                <div className="detail-stack">
                  {(selectedCase.media || [])[0]?.fileUrl ? <img className="ticket-preview" src={(selectedCase.media || [])[0].fileUrl} alt="preview" /> : null}
                </div>
              </div>

              <div className="assignment-box">
                <h4>Process</h4>
                <label><span>invoiceNumber</span><input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-2026-001" /></label>
                <label className="checkbox"><input type="checkbox" checked={invoiceIssued} onChange={(e) => setInvoiceIssued(e.target.checked)} /> invoiceIssued</label>
                <div className="quick-filter-row">
                  {processActions.map((action) => (
                    <button disabled={Boolean(actionLoading)} key={action.key + action.targetStatus} type="button" onClick={() => processCase(action.targetStatus).catch(() => setError('Переход запрещен.'))}>
                      {actionLoading === `process:${action.targetStatus}` ? 'Сохраняем...' : action.label}
                    </button>
                  ))}
                  {!processActions.length ? <p className="empty-copy">Нет доступных действий.</p> : null}
                </div>
              </div>

              <div className="assignment-box">
                <h4>Route</h4>
                <div className="quick-filter-row">
                  {routeActions.map((action) => (
                    <button disabled={Boolean(actionLoading)} key={action.key} type="button" onClick={() => applyCommercialRoute(action.targetStatus).catch(() => setError('Коммерческий переход запрещен.'))}>
                      {actionLoading === `route:${action.targetStatus}` ? 'Сохраняем...' : action.label}
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
