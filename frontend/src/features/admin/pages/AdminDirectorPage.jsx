import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminServiceApi } from '../api/adminServiceApi';
import {
  ActionRail,
  ActionRailButton,
  AlertPanel,
  DetailPanel,
  Icon,
  KPIChipCard,
  OpsBoardCard,
  StatusBadge,
} from '../components/AdminUi';
import { useAdminI18n } from '../adminI18n';

const CASE_COLUMNS = ['ready', 'processed'];
const COMMERCIAL_COLUMNS = ['ready_for_issue', 'ready_for_rent', 'ready_for_sale'];
const SERVICE_LABELS = { ready: 'ready', processed: 'processed' };
const COMMERCIAL_LABELS = {
  ready_for_issue: 'ready_for_issue',
  ready_for_rent: 'ready_for_rent',
  ready_for_sale: 'ready_for_sale',
};

function formatDate(value, locale = 'ru') { return value ? new Date(value).toLocaleString(locale === 'uk' ? 'uk-UA' : 'ru-RU') : '—'; }

function getPreviewUrl(item) {
  return item?.media?.[0]?.previewUrl
    || item?.media?.[0]?.fileUrl
    || item?.equipment?.media?.[0]?.previewUrl
    || item?.equipment?.media?.[0]?.fileUrl
    || null;
}

function DirectorCard({ item, active, onSelect }) {
  const { t, locale } = useAdminI18n();
  const warnings = [];
  if (!item.assignedToUserId) warnings.push(t('unassigned'));
  if (!item.equipmentId) warnings.push(t('no_equipment_data'));
  if (item.serviceStatus === 'ready' && (Date.now() - new Date(item.updatedAt).getTime()) > 24 * 3600000) warnings.push(t('stale_ready_alert'));

  return (
    <OpsBoardCard
      item={item}
      id={item.id}
      status={item.serviceStatus}
      statusLabel={item.serviceStatus}
      title={item.equipment?.clientName || t('client')}
      subtitle={`${item.equipment?.brand || '—'} ${item.equipment?.model || ''} · ${item.equipment?.internalNumber || '—'} / ${item.equipment?.serial || '—'}`}
      ownerType={`${t('owner')}: ${item.equipment?.ownerType || '—'}`}
      intakeType={`${t('intake')}: ${item.intakeType || '—'}`}
      assignedMaster={item.assignedToUser?.fullName || t('master_unassigned')}
      serviceStatus={item.serviceStatus}
      commercialStatus={item.equipment?.commercialStatus || 'none'}
      updatedAt={formatDate(item.updatedAt, locale)}
      warnings={warnings}
      active={active}
      onSelect={onSelect}
    />
  );
}

function RouteCard({ item, active, onSelect }) {
  const { t, locale } = useAdminI18n();
  const warnings = [];
  if (!item.serial) warnings.push(t('no_serial'));
  return (
    <OpsBoardCard
      item={item}
      id={item.id}
      status={item.commercialStatus}
      statusLabel={item.commercialStatus}
      title={item.clientName || t('client')}
      subtitle={`${item.brand || '—'} ${item.model || ''} · ${item.internalNumber || '—'} / ${item.serial || '—'}`}
      ownerType={`${t('owner')}: ${item.ownerType || '—'}`}
      intakeType={`${t('intake')}: ${item.intakeType || '—'}`}
      assignedMaster={item.assignedToUser?.fullName || t('master_empty')}
      serviceStatus={item.serviceStatus || '—'}
      commercialStatus={item.commercialStatus || 'none'}
      updatedAt={formatDate(item.updatedAt, locale)}
      warnings={warnings}
      active={active}
      onSelect={onSelect}
    />
  );
}

export function AdminDirectorPage() {
  const { t, locale } = useAdminI18n();
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
      setError(t('director_board_load_failed'));
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
      label: t(SERVICE_LABELS[status] || status),
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
      label: t(COMMERCIAL_LABELS[status]),
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
    setFeedback(t('case_processed_done'));
    setActionLoading('');
  }

  async function applyCommercialRoute(nextStatus) {
    if (!selectedCaseId || !nextStatus) return;
    setActionLoading(`route:${nextStatus}`);
    await adminServiceApi.directorCommercialRoute(selectedCaseId, nextStatus);
    await load();
    await loadCaseDetails(selectedCaseId);
    setFeedback(t('route_updated_done'));
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
      <header className="service-command">
        <div className="service-command__copy">
          <small>{t('nav_director')}</small>
          <h2>{t('director_queue_title')}</h2>
          <p>{t('director_queue_subtitle')}</p>
        </div>
        <div className="service-command__stats">
          <KPIChipCard label={t('ready')} value={serviceColumns.find((c) => c.status === 'ready')?.items.length || 0} icon="service" hint="service" />
          <KPIChipCard label={t('processed')} value={serviceColumns.find((c) => c.status === 'processed')?.items.length || 0} icon="dashboard" hint="service" />
          <KPIChipCard label={t('ready_for_issue')} value={commercialColumns.find((c) => c.status === 'ready_for_issue')?.items.length || 0} icon="equipment" hint={t('commercial_total')} />
          <KPIChipCard label={t('route_backlog')} value={commercialQueue.filter((item) => ['ready_for_issue', 'ready_for_rent', 'ready_for_sale'].includes(item.commercialStatus)).length} icon="sales" hint="director" />
        </div>
      </header>

      <section className="owner-spotlight-grid">
        <article className="owner-spotlight owner-spotlight--feature">
          <header>
            <small>{t('control_room')}</small>
            <h3>{t('release_queue_route')}</h3>
          </header>
          <div className="owner-spotlight__figures">
            <div className="owner-spotlight__metric"><span>{t('cases_for_release')}</span><strong>{serviceCases.length}</strong></div>
            <div className="owner-spotlight__metric"><span>{t('commercial_flow_count')}</span><strong>{commercialQueue.length}</strong></div>
            <div className="owner-spotlight__metric"><span>{t('stuck_ready')}</span><strong>{attention.readyTooLong}</strong></div>
            <div className="owner-spotlight__metric"><span>{t('unassigned')}</span><strong>{attention.unassigned}</strong></div>
          </div>
        </article>

        <article className="owner-spotlight">
          <header>
            <small>{t('service_cta')}</small>
            <h3>{t('case_transition')}</h3>
          </header>
          <div className="owner-spotlight__timeline">
            {serviceColumns.map((column) => <div key={column.status}><span>{column.label}</span><i style={{ width: `${Math.max((column.items.length / Math.max(serviceCases.length, 1)) * 100, 8)}%` }} /></div>)}
          </div>
        </article>

        <article className="owner-spotlight">
          <header>
            <small>{t('commercial_flow_title')}</small>
            <h3>{t('issue_routes')}</h3>
          </header>
          <div className="owner-spotlight__timeline">
            {commercialColumns.map((column) => <div key={column.status}><span>{column.label}</span><i style={{ width: `${Math.max((column.items.length / Math.max(commercialQueue.length, 1)) * 100, 8)}%` }} /></div>)}
          </div>
        </article>
      </section>

      <AlertPanel items={[
        <li key="unassigned"><span>{t('unassigned')}</span><strong>{attention.unassigned}</strong></li>,
        <li key="equipment"><span>{t('no_equipment_data')}</span><strong>{attention.noEquipment}</strong></li>,
        <li key="stale"><span>{t('stale_in_progress')}</span><strong>{attention.staleInProgress}</strong></li>,
        <li key="ready"><span>{t('stale_ready_alert')}</span><strong>{attention.readyTooLong}</strong></li>,
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
                {!column.items.length ? <p className="empty-copy">{t('queue_empty')}</p> : null}
              </div>
            </section>
          ))}

          {commercialColumns.map((column) => (
            <section key={column.status} className="kanban-column">
              <header><h4>{column.label}</h4><strong>{column.items.length}</strong></header>
              <div className="kanban-cards">
                {column.items.map((item) => <RouteCard key={item.id} item={item} active={selectedCaseId === item.id} onSelect={setSelectedCaseId} />)}
                {!column.items.length ? <p className="empty-copy">{t('queue_empty')}</p> : null}
              </div>
            </section>
          ))}
        </div>

        <DetailPanel>
          {!selectedCase ? <p>{t('select_case')}</p> : (
            <>
              <header className="detail-header"><h3>{t('request_card_title')} #{selectedCase.id}</h3><StatusBadge status={selectedCase.serviceStatus}>{selectedCase.serviceStatus}</StatusBadge></header>
              <ActionRail className="detail-toolbar">
                <ActionRailButton tone="brand">{t('director_route')}</ActionRailButton>
                <ActionRailButton>{selectedCase.equipment?.commercialStatus || 'none'}</ActionRailButton>
                <ActionRailButton>{formatDate(selectedCase.updatedAt, locale)}</ActionRailButton>
              </ActionRail>
              <section className="detail-hero">
                <div className="detail-hero__copy">
                  <div className="detail-hero__eyebrow">
                    <small>{t('director_flow')}</small>
                    <strong>{selectedCase.equipment?.clientName || t('client')}</strong>
                  </div>
                  <div className="detail-grid">
                    <p><Icon name="clients" /> {t('client')}: {selectedCase.equipment?.clientName || '—'}</p>
                    <p><Icon name="equipment" /> {t('equipment')}: {selectedCase.equipment?.brand || '—'} {selectedCase.equipment?.model || ''}</p>
                    <p><Icon name="equipment" /> {t('internal_serial')}: {selectedCase.equipment?.internalNumber || '—'} / {selectedCase.equipment?.serial || '—'}</p>
                    <p><Icon name="employees" /> {t('assignee')}: {selectedCase.assignedToUser?.fullName || '—'}</p>
                    <p><Icon name="sales" /> {t('commerce')}: {selectedCase.equipment?.commercialStatus || 'none'}</p>
                    <p><Icon name="service" /> {t('updated')}: {formatDate(selectedCase.updatedAt, locale)}</p>
                  </div>
                </div>
                <div className="detail-hero__preview">
                  {getPreviewUrl(selectedCase) ? <img className="ticket-preview" src={getPreviewUrl(selectedCase)} alt={t('photo')} /> : <div className="service-board-card__preview-empty"><Icon name="equipment" /><span>{t('no_photo')}</span></div>}
                </div>
              </section>

              <div className="detail-section-card">
                <h4>{t('process')}</h4>
                <label><span>{t('invoice_number')}</span><input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-2026-001" /></label>
                <label className="checkbox"><input type="checkbox" checked={invoiceIssued} onChange={(e) => setInvoiceIssued(e.target.checked)} /> {t('invoice_issued')}</label>
                <ActionRail>
                  {processActions.map((action) => (
                    <ActionRailButton tone="brand" disabled={Boolean(actionLoading)} key={action.key + action.targetStatus} onClick={() => processCase(action.targetStatus).catch(() => setError(t('transition_forbidden')))}>
                      {actionLoading === `process:${action.targetStatus}` ? t('saving') : action.label}
                    </ActionRailButton>
                  ))}
                  {!processActions.length ? <p className="empty-copy">{t('no_actions')}</p> : null}
                </ActionRail>
              </div>

              <div className="detail-section-card">
                <h4>{t('route')}</h4>
                <ActionRail>
                  {routeActions.map((action) => (
                    <ActionRailButton disabled={Boolean(actionLoading)} key={action.key} onClick={() => applyCommercialRoute(action.targetStatus).catch(() => setError(t('commercial_transition_forbidden')))}>
                      {actionLoading === `route:${action.targetStatus}` ? t('saving') : action.label}
                    </ActionRailButton>
                  ))}
                  {!routeActions.length ? <p className="empty-copy">{t('no_actions')}</p> : null}
                </ActionRail>
              </div>
            </>
          )}
        </DetailPanel>
      </div>
    </section>
  );
}
