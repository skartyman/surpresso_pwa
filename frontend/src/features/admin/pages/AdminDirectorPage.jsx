import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminServiceApi } from '../api/adminServiceApi';
import { AlertPanel, DetailPanel, Icon, KPIChipCard, OpsBoardCard, StatusBadge } from '../components/AdminUi';
import { useAdminI18n } from '../adminI18n';

const CASE_COLUMNS = ['ready', 'processed'];
const COMMERCIAL_COLUMNS = ['ready_for_issue', 'ready_for_rent', 'ready_for_sale'];
const SERVICE_LABELS = { ready: 'Готово', processed: 'Обработано' };
const COMMERCIAL_LABELS = {
  ready_for_issue: 'Готово к выдаче',
  ready_for_rent: 'Готово к аренде',
  ready_for_sale: 'Готово к продаже',
};

function formatDate(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }

function DirectorCard({ item, active, onSelect }) {
  const { t } = useAdminI18n();
  const warnings = [];
  if (!item.assignedToUserId) warnings.push(t('unassigned'));
  if (!item.equipmentId) warnings.push(t('no_equipment_data'));
  if (item.serviceStatus === 'ready' && (Date.now() - new Date(item.updatedAt).getTime()) > 24 * 3600000) warnings.push('Слишком долго в статусе «Готово»');

  return (
    <OpsBoardCard
      item={item}
      id={item.id}
      status={item.serviceStatus}
      statusLabel={item.serviceStatus}
      title={item.equipment?.clientName || 'Клиент'}
      subtitle={`${item.equipment?.brand || '—'} ${item.equipment?.model || ''} · ${item.equipment?.internalNumber || '—'} / ${item.equipment?.serial || '—'}`}
      ownerType={`${t('owner')}: ${item.equipment?.ownerType || '—'}`}
      intakeType={`${t('intake')}: ${item.intakeType || '—'}`}
      assignedMaster={item.assignedToUser?.fullName || t('master_unassigned')}
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
  const { t } = useAdminI18n();
  const warnings = [];
  if (!item.serial) warnings.push(t('no_serial'));
  return (
    <OpsBoardCard
      item={item}
      id={item.id}
      status={item.commercialStatus}
      statusLabel={item.commercialStatus}
      title={item.clientName || 'Клиент'}
      subtitle={`${item.brand || '—'} ${item.model || ''} · ${item.internalNumber || '—'} / ${item.serial || '—'}`}
      ownerType={`${t('owner')}: ${item.ownerType || '—'}`}
      intakeType={`${t('intake')}: ${item.intakeType || '—'}`}
      assignedMaster={item.assignedToUser?.fullName || t('master_empty')}
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
  const { t } = useAdminI18n();
  const [searchParams] = useSearchParams();
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
      const requestedStatus = searchParams.get('serviceStatus');
      const requestedEquipmentId = searchParams.get('equipmentId');
      const payload = await adminServiceApi.directorQueue(requestedStatus ? { serviceStatus: requestedStatus } : {});
      const nextCases = payload.serviceCases || [];
      const nextCommercial = payload.commercialQueue || [];
      setServiceCases(nextCases);
      setCommercialQueue(nextCommercial);
      setSelectedCaseId((prev) => prev
        || nextCases.find((item) => item.equipmentId === requestedEquipmentId)?.id
        || nextCommercial.find((item) => item.id === requestedEquipmentId)?.id
        || nextCases[0]?.id
        || null);
      setError('');
    } catch {
      setError('Не удалось загрузить очередь директора.');
    }
  }

  async function loadCaseDetails(id) {
    const payload = await adminServiceApi.serviceCaseById(id);
    const item = payload.item || null;
    setSelectedCase(item);
    setInvoiceNumber(item?.invoiceNumber || '');
    setInvoiceIssued(Boolean(item?.invoiceIssued));
  }

  useEffect(() => { load(); }, [searchParams]); // eslint-disable-line
  useEffect(() => {
    if (!selectedCaseId) return setSelectedCase(null);
    loadCaseDetails(selectedCaseId).catch(() => setSelectedCase(null));
  }, [selectedCaseId]);

  const serviceColumns = useMemo(() => {
    const requestedEquipmentId = searchParams.get('equipmentId');
    const source = requestedEquipmentId
      ? serviceCases.filter((item) => item.equipmentId === requestedEquipmentId)
      : serviceCases;

    return CASE_COLUMNS.map((status) => ({
      status,
      label: SERVICE_LABELS[status] || status,
      items: source.filter((item) => item.serviceStatus === status),
    }));
  }, [searchParams, serviceCases]);

  const commercialColumns = useMemo(() => {
    const filterStatus = searchParams.get('commercialStatus');
    const source = commercialQueue.filter((item) => {
      if (!filterStatus) return true;
      if (filterStatus === 'route_backlog') return ['ready_for_issue', 'ready_for_rent', 'ready_for_sale'].includes(item.commercialStatus);
      return item.commercialStatus === filterStatus;
    });

    const requestedEquipmentId = searchParams.get('equipmentId');
    const filteredByEquipment = requestedEquipmentId
      ? source.filter((item) => item.id === requestedEquipmentId)
      : source;

    return COMMERCIAL_COLUMNS.map((status) => ({
      status,
      label: COMMERCIAL_LABELS[status],
      items: filteredByEquipment.filter((item) => item.commercialStatus === status),
    }));
  }, [commercialQueue, searchParams]);

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
      <header className="service-headline"><div><h2>{t('director_queue_title')}</h2><p>{t('director_queue_subtitle')}</p></div></header>
      <div className="kpi-row">
        <KPIChipCard label="Готово" value={serviceColumns.find((c) => c.status === 'ready')?.items.length || 0} icon="service" hint="Service" />
        <KPIChipCard label="Обработано" value={serviceColumns.find((c) => c.status === 'processed')?.items.length || 0} icon="dashboard" hint="Service" />
        <KPIChipCard label={t('ready_for_issue')} value={commercialColumns.find((c) => c.status === 'ready_for_issue')?.items.length || 0} icon="equipment" hint={t('commercial_total')} />
        <KPIChipCard label={t('ready_for_rent')} value={commercialColumns.find((c) => c.status === 'ready_for_rent')?.items.length || 0} icon="sales" hint={t('commercial_total')} />
        <KPIChipCard label={t('ready_for_sale')} value={commercialColumns.find((c) => c.status === 'ready_for_sale')?.items.length || 0} icon="sales" hint={t('commercial_total')} />
        <KPIChipCard label={t('stale_ready')} value={serviceCases.filter((item) => item.serviceStatus === 'ready' && (Date.now() - new Date(item.updatedAt).getTime()) > 24 * 3600000).length} icon="bell" hint={t('nav_director')} />
        <KPIChipCard label="Обработано сегодня" value={serviceCases.filter((item) => {
          const ts = item.processedAt ? new Date(item.processedAt).getTime() : null;
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          return ts && ts >= start.getTime();
        }).length} icon="dashboard" hint="Director" />
        <KPIChipCard label={t('route_backlog')} value={commercialQueue.filter((item) => ['ready_for_issue', 'ready_for_rent', 'ready_for_sale'].includes(item.commercialStatus)).length} icon="sales" hint={t('nav_director')} />
      </div>

      <AlertPanel items={[
        <li key="unassigned"><span>{t('unassigned')}</span><strong>{attention.unassigned}</strong></li>,
        <li key="equipment"><span>{t('no_equipment_data')}</span><strong>{attention.noEquipment}</strong></li>,
        <li key="stale"><span>{t('stale_in_progress')}</span><strong>{attention.staleInProgress}</strong></li>,
        <li key="ready"><span>Слишком долго в статусе «Готово»</span><strong>{attention.readyTooLong}</strong></li>,
        <li key="backlog"><span>{t('rent_sale_backlog')}</span><strong>{attention.rentSaleBacklog}</strong></li>,
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
          {!selectedCase ? <p>{t('select_case')}</p> : (
            <>
              <header className="detail-header"><h3>Кейс #{selectedCase.id}</h3><StatusBadge status={selectedCase.serviceStatus}>{selectedCase.serviceStatus}</StatusBadge></header>
              <div className="detail-split">
                <div className="detail-grid">
                  <p><Icon name="clients" /> Клиент: {selectedCase.equipment?.clientName || '—'}</p>
                  <p><Icon name="equipment" /> Оборудование: {selectedCase.equipment?.brand || '—'} {selectedCase.equipment?.model || ''}</p>
                  <p><Icon name="equipment" /> {t('internal_serial')}: {selectedCase.equipment?.internalNumber || '—'} / {selectedCase.equipment?.serial || '—'}</p>
                  <p><Icon name="employees" /> Исполнитель: {selectedCase.assignedToUser?.fullName || '—'}</p>
                  <p><Icon name="sales" /> Коммерция: {selectedCase.equipment?.commercialStatus || 'none'}</p>
                  <p><Icon name="service" /> Обновлено: {formatDate(selectedCase.updatedAt)}</p>
                </div>
                <div className="detail-stack">
                  {(selectedCase.media || [])[0]?.fileUrl ? <img className="ticket-preview" src={(selectedCase.media || [])[0].fileUrl} alt="preview" /> : null}
                </div>
              </div>

              <div className="assignment-box">
                <h4>{t('process')}</h4>
                <label><span>{t('invoice_number')}</span><input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-2026-001" /></label>
                <label className="checkbox"><input type="checkbox" checked={invoiceIssued} onChange={(e) => setInvoiceIssued(e.target.checked)} /> {t('invoice_issued')}</label>
                <div className="quick-filter-row">
                  {processActions.map((action) => (
                    <button disabled={Boolean(actionLoading)} key={action.key + action.targetStatus} type="button" onClick={() => processCase(action.targetStatus).catch(() => setError('Переход запрещен.'))}>
                      {actionLoading === `process:${action.targetStatus}` ? 'Сохраняем...' : action.label}
                    </button>
                  ))}
                  {!processActions.length ? <p className="empty-copy">{t('no_actions')}</p> : null}
                </div>
              </div>

              <div className="assignment-box">
                <h4>{t('route')}</h4>
                <div className="quick-filter-row">
                  {routeActions.map((action) => (
                    <button disabled={Boolean(actionLoading)} key={action.key} type="button" onClick={() => applyCommercialRoute(action.targetStatus).catch(() => setError('Коммерческий переход запрещен.'))}>
                      {actionLoading === `route:${action.targetStatus}` ? 'Сохраняем...' : action.label}
                    </button>
                  ))}
                  {!routeActions.length ? <p className="empty-copy">{t('no_actions')}</p> : null}
                </div>
              </div>
            </>
          )}
        </DetailPanel>
      </div>
    </section>
  );
}
