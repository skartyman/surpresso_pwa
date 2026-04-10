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

const SALES_COLUMNS = ['ready_for_rent', 'reserved_for_rent', 'out_on_rent', 'ready_for_sale', 'reserved_for_sale', 'sold'];
const LABELS = {
  ready_for_rent: 'ready_for_rent',
  reserved_for_rent: 'reserved_for_rent',
  out_on_rent: 'out_on_rent',
  ready_for_sale: 'ready_for_sale',
  reserved_for_sale: 'reserved_for_sale',
  sold: 'sold',
};

function formatDate(value, locale = 'ru') { return value ? new Date(value).toLocaleString(locale === 'uk' ? 'uk-UA' : 'ru-RU') : '—'; }

function getPreviewUrl(item) {
  return item?.media?.[0]?.previewUrl || item?.media?.[0]?.fileUrl || null;
}

function getSalesRequestTypeLabel(type, t) {
  const value = String(type || '').trim().toLowerCase();
  if (value === 'coffee_order') return t('sales_request_coffee_order');
  if (value === 'coffee_tasting') return t('sales_request_tasting');
  if (value === 'equipment_rent' || value === 'rental_auto' || value === 'rental_pro') return t('sales_request_rent');
  if (value === 'equipment_purchase') return t('sales_request_purchase');
  if (value === 'feedback') return t('sales_request_feedback');
  return value || t('request');
}

function SalesLeadCard({ item, active, onSelect, t, locale }) {
  return (
    <button type="button" className={`sales-lead-card ${active ? 'active' : ''}`} onClick={() => onSelect(item.id)}>
      <div className="sales-lead-card__head">
        <strong>{item.title || item.id}</strong>
        <StatusBadge status={item.status || 'new'}>{t(item.status || 'new')}</StatusBadge>
      </div>
      <p>{getSalesRequestTypeLabel(item.type, t)}</p>
      <small>{item.client?.companyName || item.location?.name || t('client')}</small>
      <small>{item.client?.phone || item.pointUser?.phone || t('no_phone')}</small>
      <em>{formatDate(item.updatedAt, locale)}</em>
    </button>
  );
}

function SalesCard({ item, active, onSelect }) {
  const { t, locale } = useAdminI18n();
  const status = item.commercialStatus || 'none';
  const warnings = [];
  if (!item.serial) warnings.push(t('no_serial'));
  if (status === 'ready_for_rent' && (Date.now() - new Date(item.updatedAt).getTime()) > 24 * 3600000) warnings.push(t('stale_ready_alert'));
  if (status === 'ready_for_sale' && (Date.now() - new Date(item.updatedAt).getTime()) > 24 * 3600000) warnings.push(t('stale_ready_alert'));

  return (
    <OpsBoardCard
      item={item}
      id={item.id}
      status={status}
      statusLabel={t(LABELS[status] || status)}
      title={item.clientName || t('client')}
      subtitle={`${item.brand || '—'} ${item.model || ''} · ${item.internalNumber || '—'} / ${item.serial || '—'}`}
      ownerType={`${t('owner')}: ${item.ownerType || '—'}`}
      intakeType={`${t('intake')}: ${item.intakeType || '—'}`}
      assignedMaster={item.assignedToUser?.fullName || t('master_empty')}
      serviceStatus={item.serviceStatus || '—'}
      commercialStatus={status}
      updatedAt={formatDate(item.updatedAt, locale)}
      warnings={warnings}
      active={active}
      onSelect={onSelect}
    />
  );
}

export function AdminSalesPage() {
  const { t, locale } = useAdminI18n();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [salesRequests, setSalesRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [relatedCases, setRelatedCases] = useState([]);
  const [actionLoading, setActionLoading] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const [payload, requestsPayload] = await Promise.all([
        adminServiceApi.salesEquipment(),
        adminServiceApi.list({ sort: 'updatedAt' }).catch(() => ({ requests: [] })),
      ]);
      const rows = payload.items || [];
      const requestRows = (requestsPayload.requests || []).filter((item) => item.assignedDepartment === 'sales');
      const requestedEquipmentId = searchParams.get('equipmentId');
      setItems(rows);
      setSalesRequests(requestRows);
      setSelectedId((prev) => prev || requestedEquipmentId || rows[0]?.id || null);
      setSelectedLeadId((prev) => prev || requestRows[0]?.id || null);
      setError('');
    } catch {
        setError(t('sales_board_load_failed'));
    }
  }

  async function loadDetails(id) {
    const [equipment, serviceCases] = await Promise.all([
      adminServiceApi.equipmentById(id),
      adminServiceApi.equipmentServiceCases(id).catch(() => ({ items: [] })),
    ]);
    setSelectedEquipment(equipment.item || null);
    setRelatedCases(serviceCases.items || []);
  }

  async function loadLeadDetails(id) {
    if (!id) {
      setSelectedLead(null);
      return;
    }
    const payload = await adminServiceApi.byId(id);
    setSelectedLead(payload.request || null);
  }

  useEffect(() => { load(); }, [searchParams]); // eslint-disable-line
  useEffect(() => {
    if (!selectedId) return setSelectedEquipment(null);
    loadDetails(selectedId).catch(() => {
      setSelectedEquipment(null);
      setRelatedCases([]);
    });
  }, [selectedId]);
  useEffect(() => {
    loadLeadDetails(selectedLeadId).catch(() => setSelectedLead(null));
  }, [selectedLeadId]);

  const columns = useMemo(() => {
    const requested = searchParams.get('commercialStatus');
    const requestedEquipmentId = searchParams.get('equipmentId');
    const source = items.filter((row) => {
      const status = row.commercialStatus || 'none';
      if (!requested) return true;
      if (requested === 'rent_backlog') return ['ready_for_rent', 'reserved_for_rent'].includes(status);
      if (requested === 'sale_backlog') return ['ready_for_sale', 'reserved_for_sale'].includes(status);
      if (requested === 'reserved_aging') return ['reserved_for_rent', 'reserved_for_sale'].includes(status) && (Date.now() - new Date(row.updatedAt).getTime()) > 48 * 3600000;
      if (status !== requested) return false;
      return true;
    }).filter((row) => !requestedEquipmentId || row.id === requestedEquipmentId);

    return SALES_COLUMNS.map((status) => ({
      status,
      label: t(LABELS[status]),
      items: source.filter((row) => (row.commercialStatus || 'none') === status),
    }));
  }, [items, searchParams]);

  const caseHint = relatedCases[0] || null;
  const caseId = caseHint?.id || null;
  const actions = selectedEquipment?.nextActions?.all || [];
  const salesLeadMetrics = useMemo(() => ({
    total: salesRequests.length,
    newCount: salesRequests.filter((item) => item.status === 'new').length,
    rentCount: salesRequests.filter((item) => ['equipment_rent', 'rental_auto', 'rental_pro'].includes(item.type)).length,
    buyCount: salesRequests.filter((item) => item.type === 'equipment_purchase').length,
    coffeeCount: salesRequests.filter((item) => item.type === 'coffee_order').length,
  }), [salesRequests]);

  async function performAction(actionKey, targetStatus) {
    if (!selectedId) return;
    setActionLoading(`${actionKey}:${targetStatus || ''}`);
    if (actionKey === 'reserve-rent') {
      await adminServiceApi.reserveRent(selectedId, caseId);
    } else if (actionKey === 'reserve-sale') {
      await adminServiceApi.reserveSale(selectedId, caseId);
    } else {
      await adminServiceApi.updateCommercialStatus(selectedId, targetStatus, '', caseId);
    }
    await load();
    await loadDetails(selectedId);
    setFeedback(t('commercial_action_done_short'));
    setActionLoading('');
  }

  const attention = {
    unassigned: items.filter((item) => !item.assignedToUserId).length,
    noEquipment: items.filter((item) => !item.id || !item.serial).length,
    staleInProgress: items.filter((item) => item.serviceStatus === 'in_progress' && (Date.now() - new Date(item.updatedAt).getTime()) > 48 * 3600000).length,
    readyTooLong: items.filter((item) => ['ready_for_rent', 'ready_for_sale'].includes(item.commercialStatus) && (Date.now() - new Date(item.updatedAt).getTime()) > 24 * 3600000).length,
    rentSaleBacklog: items.filter((item) => ['ready_for_rent', 'reserved_for_rent', 'ready_for_sale', 'reserved_for_sale'].includes(item.commercialStatus)).length,
  };

  return (
    <section className="service-dashboard">
      <header className="service-command">
        <div className="service-command__copy">
          <small>{t('nav_sales')}</small>
          <h2>{t('sales_board_title')}</h2>
          <p>{t('sales_board_subtitle')}</p>
        </div>
        <div className="service-command__stats">
          <KPIChipCard label={t('ready_for_rent')} value={columns.find((c) => c.status === 'ready_for_rent')?.items.length || 0} icon="sales" hint="sales" />
          <KPIChipCard label={t('rent_now')} value={columns.find((c) => c.status === 'out_on_rent')?.items.length || 0} icon="sales" hint="sales" />
          <KPIChipCard label={t('ready_for_sale')} value={columns.find((c) => c.status === 'ready_for_sale')?.items.length || 0} icon="sales" hint="sales" />
          <KPIChipCard label={t('sold')} value={columns.find((c) => c.status === 'sold')?.items.length || 0} icon="dashboard" hint="sales" />
        </div>
      </header>

      <section className="owner-spotlight-grid">
        <article className="owner-spotlight owner-spotlight--feature">
          <header>
            <small>{t('commercial_room')}</small>
            <h3>{t('rent_sale_reserve_flow')}</h3>
          </header>
          <div className="owner-spotlight__figures">
            <div className="owner-spotlight__metric"><span>{t('total_equipment_short')}</span><strong>{items.length}</strong></div>
            <div className="owner-spotlight__metric"><span>{t('rent_sale_backlog')}</span><strong>{items.filter((item) => ['ready_for_rent', 'reserved_for_rent'].includes(item.commercialStatus)).length}</strong></div>
            <div className="owner-spotlight__metric"><span>{t('sale_booking')}</span><strong>{items.filter((item) => ['ready_for_sale', 'reserved_for_sale'].includes(item.commercialStatus)).length}</strong></div>
            <div className="owner-spotlight__metric"><span>{t('reserved_aging')}</span><strong>{items.filter((item) => ['reserved_for_rent', 'reserved_for_sale'].includes(item.commercialStatus) && (Date.now() - new Date(item.updatedAt).getTime()) > 48 * 3600000).length}</strong></div>
          </div>
        </article>

        <article className="owner-spotlight">
          <header>
            <small>{t('rent_column')}</small>
            <h3>{t('rent_flow')}</h3>
          </header>
          <div className="owner-spotlight__timeline">
            {columns.filter((column) => ['ready_for_rent', 'reserved_for_rent', 'out_on_rent'].includes(column.status)).map((column) => <div key={column.status}><span>{column.label}</span><i style={{ width: `${Math.max((column.items.length / Math.max(items.length, 1)) * 100, 8)}%` }} /></div>)}
          </div>
        </article>

        <article className="owner-spotlight">
          <header>
            <small>{t('sale_column')}</small>
            <h3>{t('sale_flow')}</h3>
          </header>
          <div className="owner-spotlight__timeline">
            {columns.filter((column) => ['ready_for_sale', 'reserved_for_sale', 'sold'].includes(column.status)).map((column) => <div key={column.status}><span>{column.label}</span><i style={{ width: `${Math.max((column.items.length / Math.max(items.length, 1)) * 100, 8)}%` }} /></div>)}
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

      <section className="sales-leads-shell">
        <header className="sales-leads-shell__header">
          <div>
            <small>{t('sales_request_stream')}</small>
            <h3>{t('sales_request_queue')}</h3>
          </div>
          <div className="sales-leads-shell__stats">
            <span>{t('total')}: <strong>{salesLeadMetrics.total}</strong></span>
            <span>{t('new')}: <strong>{salesLeadMetrics.newCount}</strong></span>
            <span>{t('sales_request_rent')}: <strong>{salesLeadMetrics.rentCount}</strong></span>
            <span>{t('sales_request_purchase')}: <strong>{salesLeadMetrics.buyCount}</strong></span>
            <span>{t('sales_request_coffee_order')}: <strong>{salesLeadMetrics.coffeeCount}</strong></span>
          </div>
        </header>
        <div className="sales-leads-shell__layout">
          <div className="sales-leads-shell__list">
            {salesRequests.map((item) => (
              <SalesLeadCard key={item.id} item={item} active={selectedLeadId === item.id} onSelect={setSelectedLeadId} t={t} locale={locale} />
            ))}
            {!salesRequests.length ? <p className="empty-copy">{t('queue_empty')}</p> : null}
          </div>
          <div className="sales-leads-shell__detail">
            {!selectedLead ? <p>{t('select_request')}</p> : (
              <>
                <header className="detail-header">
                  <h3>{selectedLead.title || selectedLead.id}</h3>
                  <StatusBadge status={selectedLead.status || 'new'}>{t(selectedLead.status || 'new')}</StatusBadge>
                </header>
                <div className="detail-grid">
                  <p><Icon name="sales" /> {t('request_type')}: {getSalesRequestTypeLabel(selectedLead.type, t)}</p>
                  <p><Icon name="clients" /> {t('client')}: {selectedLead.client?.companyName || selectedLead.location?.name || '—'}</p>
                  <p><Icon name="clients" /> {t('contact_back')}: {selectedLead.pointUser?.phone || selectedLead.client?.phone || t('no_phone')}</p>
                  <p><Icon name="service" /> {t('updated')}: {formatDate(selectedLead.updatedAt, locale)}</p>
                </div>
                <div className="detail-section-card">
                  <h4>{t('problem_description')}</h4>
                  <p>{selectedLead.description || '—'}</p>
                </div>
                <ActionRail>
                  {(selectedLead.pointUser?.phone || selectedLead.client?.phone) ? (
                    <a className="action-rail__button" href={`tel:${selectedLead.pointUser?.phone || selectedLead.client?.phone}`}>{t('call_client')}</a>
                  ) : null}
                  {(selectedLead.pointUser?.telegramUserId || selectedLead.client?.telegramUserId) ? (
                    <a className="action-rail__button" href={`tg://user?id=${selectedLead.pointUser?.telegramUserId || selectedLead.client?.telegramUserId}`}>{t('open_telegram')}</a>
                  ) : null}
                </ActionRail>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="service-workspace kanban-layout">
        <div className="kanban-board">
          {columns.map((column) => (
            <section key={column.status} className="kanban-column">
              <header><h4>{column.label}</h4><strong>{column.items.length}</strong></header>
              <div className="kanban-cards">
                {column.items.map((item) => <SalesCard key={item.id} item={item} active={selectedId === item.id} onSelect={setSelectedId} />)}
                {!column.items.length ? <p className="empty-copy">{t('queue_empty')}</p> : null}
              </div>
            </section>
          ))}
        </div>

        <DetailPanel>
          {!selectedEquipment ? <p>{t('select_equipment')}</p> : (
            <>
              <header className="detail-header"><h3>{selectedEquipment.id}</h3><StatusBadge status={selectedEquipment.commercialStatus || 'none'}>{t(LABELS[selectedEquipment.commercialStatus || 'none'] || (selectedEquipment.commercialStatus || 'none'))}</StatusBadge></header>
              <ActionRail className="detail-toolbar">
                <ActionRailButton tone="brand">{t('commercial_flow_chip')}</ActionRailButton>
                <ActionRailButton>{selectedEquipment.serviceStatus || '—'}</ActionRailButton>
                <ActionRailButton>{formatDate(selectedEquipment.updatedAt, locale)}</ActionRailButton>
              </ActionRail>
              <section className="detail-hero">
                <div className="detail-hero__copy">
                  <div className="detail-hero__eyebrow">
                    <small>{t('sales_item')}</small>
                    <strong>{selectedEquipment.clientName || t('client')}</strong>
                  </div>
                  <div className="detail-grid">
                    <p><Icon name="clients" /> {t('client')}: {selectedEquipment.clientName || '—'}</p>
                    <p><Icon name="equipment" /> {t('equipment')}: {selectedEquipment.brand || '—'} {selectedEquipment.model || ''}</p>
                    <p><Icon name="equipment" /> {t('internal_serial')}: {selectedEquipment.internalNumber || '—'} / {selectedEquipment.serial || '—'}</p>
                    <p><Icon name="service" /> {t('service_status_label')}: {selectedEquipment.serviceStatus || '—'}</p>
                    <p><Icon name="sales" /> {t('updated')}: {formatDate(selectedEquipment.updatedAt, locale)}</p>
                  </div>
                </div>
                <div className="detail-hero__preview">
                  {getPreviewUrl(selectedEquipment) ? <img className="ticket-preview" src={getPreviewUrl(selectedEquipment)} alt={t('photo')} /> : <div className="service-board-card__preview-empty"><Icon name="equipment" /><span>{t('no_photo')}</span></div>}
                </div>
              </section>

              <div className="detail-section-card">
                <h4>{t('commercial_actions')}</h4>
                <ActionRail>
                  {actions.map((action) => (
                    <ActionRailButton tone={action.key.startsWith('reserve') ? 'brand' : 'default'} disabled={Boolean(actionLoading)} key={action.key + action.targetStatus} onClick={() => performAction(action.key, action.targetStatus).catch(() => setError(t('commercial_transition_forbidden')))}>
                      {actionLoading === `${action.key}:${action.targetStatus || ''}` ? t('saving') : action.label}
                    </ActionRailButton>
                  ))}
                  {!actions.length ? <p className="empty-copy">{t('no_actions')}</p> : null}
                </ActionRail>
              </div>
            </>
          )}
        </DetailPanel>
      </div>
    </section>
  );
}
