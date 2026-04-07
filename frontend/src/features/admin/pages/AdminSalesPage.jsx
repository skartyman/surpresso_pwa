import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminServiceApi } from '../api/adminServiceApi';
import { AlertPanel, DetailPanel, Icon, KPIChipCard, OpsBoardCard, StatusBadge } from '../components/AdminUi';
import { useAdminI18n } from '../adminI18n';

const SALES_COLUMNS = ['ready_for_rent', 'reserved_for_rent', 'out_on_rent', 'ready_for_sale', 'reserved_for_sale', 'sold'];
const LABELS = {
  ready_for_rent: 'Готово к аренде',
  reserved_for_rent: 'Зарезервировано под аренду',
  out_on_rent: 'В аренде',
  ready_for_sale: 'Готово к продаже',
  reserved_for_sale: 'Зарезервировано к продаже',
  sold: 'Продано',
};

function formatDate(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }

function SalesCard({ item, active, onSelect }) {
  const { t } = useAdminI18n();
  const status = item.commercialStatus || 'none';
  const warnings = [];
  if (!item.serial) warnings.push(t('no_serial'));
  if (status === 'ready_for_rent' && (Date.now() - new Date(item.updatedAt).getTime()) > 24 * 3600000) warnings.push('Слишком долго в статусе «Готово»');
  if (status === 'ready_for_sale' && (Date.now() - new Date(item.updatedAt).getTime()) > 24 * 3600000) warnings.push('Слишком долго в статусе «Готово»');

  return (
    <OpsBoardCard
      item={item}
      id={item.id}
      status={status}
      statusLabel={LABELS[status] || status}
      title={item.clientName || 'Клиент'}
      subtitle={`${item.brand || '—'} ${item.model || ''} · ${item.internalNumber || '—'} / ${item.serial || '—'}`}
      ownerType={`${t('owner')}: ${item.ownerType || '—'}`}
      intakeType={`${t('intake')}: ${item.intakeType || '—'}`}
      assignedMaster={item.assignedToUser?.fullName || t('master_empty')}
      serviceStatus={item.serviceStatus || '—'}
      commercialStatus={status}
      updatedAt={formatDate(item.updatedAt)}
      warnings={warnings}
      active={active}
      onSelect={onSelect}
    />
  );
}

export function AdminSalesPage() {
  const { t } = useAdminI18n();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [relatedCases, setRelatedCases] = useState([]);
  const [actionLoading, setActionLoading] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const payload = await adminServiceApi.salesEquipment();
      const rows = payload.items || [];
      const requestedEquipmentId = searchParams.get('equipmentId');
      setItems(rows);
      setSelectedId((prev) => prev || requestedEquipmentId || rows[0]?.id || null);
      setError('');
    } catch {
        setError('Не удалось загрузить доску продаж.');
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

  useEffect(() => { load(); }, [searchParams]); // eslint-disable-line
  useEffect(() => {
    if (!selectedId) return setSelectedEquipment(null);
    loadDetails(selectedId).catch(() => {
      setSelectedEquipment(null);
      setRelatedCases([]);
    });
  }, [selectedId]);

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
      label: LABELS[status],
      items: source.filter((row) => (row.commercialStatus || 'none') === status),
    }));
  }, [items, searchParams]);

  const caseHint = relatedCases[0] || null;
  const caseId = caseHint?.id || null;
  const actions = selectedEquipment?.nextActions?.all || [];

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
    setFeedback('Коммерческое действие выполнено.');
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
      <header className="service-headline"><div><h2>{t('sales_board_title')}</h2><p>{t('sales_board_subtitle')}</p></div></header>
      <div className="kpi-row">
        <KPIChipCard label="Готово к аренде" value={columns.find((c) => c.status === 'ready_for_rent')?.items.length || 0} icon="sales" hint="Sales" />
        <KPIChipCard label="Зарезервировано под аренду" value={columns.find((c) => c.status === 'reserved_for_rent')?.items.length || 0} icon="sales" hint="Sales" />
        <KPIChipCard label="В аренде" value={columns.find((c) => c.status === 'out_on_rent')?.items.length || 0} icon="sales" hint="Sales" />
        <KPIChipCard label="Готово к продаже" value={columns.find((c) => c.status === 'ready_for_sale')?.items.length || 0} icon="sales" hint="Sales" />
        <KPIChipCard label="Зарезервировано к продаже" value={columns.find((c) => c.status === 'reserved_for_sale')?.items.length || 0} icon="sales" hint="Sales" />
        <KPIChipCard label="Продано" value={columns.find((c) => c.status === 'sold')?.items.length || 0} icon="dashboard" hint="Sales" />
        <KPIChipCard label="Бэклог аренды" value={items.filter((item) => ['ready_for_rent', 'reserved_for_rent'].includes(item.commercialStatus)).length} icon="sales" hint="Sales" />
        <KPIChipCard label="Бэклог продажи" value={items.filter((item) => ['ready_for_sale', 'reserved_for_sale'].includes(item.commercialStatus)).length} icon="sales" hint="Sales" />
        <KPIChipCard label="Задержка в бронях" value={items.filter((item) => ['reserved_for_rent', 'reserved_for_sale'].includes(item.commercialStatus) && (Date.now() - new Date(item.updatedAt).getTime()) > 48 * 3600000).length} icon="bell" hint="Sales" />
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
          {columns.map((column) => (
            <section key={column.status} className="kanban-column">
              <header><h4>{column.label}</h4><strong>{column.items.length}</strong></header>
              <div className="kanban-cards">
                {column.items.map((item) => <SalesCard key={item.id} item={item} active={selectedId === item.id} onSelect={setSelectedId} />)}
                {!column.items.length ? <p className="empty-copy">Пусто</p> : null}
              </div>
            </section>
          ))}
        </div>

        <DetailPanel>
          {!selectedEquipment ? <p>{t('select_equipment')}</p> : (
            <>
              <header className="detail-header"><h3>{selectedEquipment.id}</h3><StatusBadge status={selectedEquipment.commercialStatus || 'none'}>{LABELS[selectedEquipment.commercialStatus || 'none'] || (selectedEquipment.commercialStatus || 'none')}</StatusBadge></header>
              <div className="detail-split">
                <div className="detail-grid">
                  <p><Icon name="clients" /> Клиент: {selectedEquipment.clientName || '—'}</p>
                  <p><Icon name="equipment" /> Оборудование: {selectedEquipment.brand || '—'} {selectedEquipment.model || ''}</p>
                  <p><Icon name="equipment" /> {t('internal_serial')}: {selectedEquipment.internalNumber || '—'} / {selectedEquipment.serial || '—'}</p>
                  <p><Icon name="service" /> Статус сервиса: {selectedEquipment.serviceStatus || '—'}</p>
                  <p><Icon name="sales" /> Обновлено: {formatDate(selectedEquipment.updatedAt)}</p>
                </div>
                <div className="detail-stack">
                  {(selectedEquipment.media || [])[0]?.fileUrl ? <img className="ticket-preview" src={(selectedEquipment.media || [])[0].fileUrl} alt="preview" /> : null}
                </div>
              </div>

              <div className="assignment-box">
                <h4>Коммерческие действия</h4>
                <div className="quick-filter-row">
                  {actions.map((action) => (
                    <button disabled={Boolean(actionLoading)} key={action.key + action.targetStatus} type="button" onClick={() => performAction(action.key, action.targetStatus).catch(() => setError('Коммерческий переход запрещен.'))}>
                      {actionLoading === `${action.key}:${action.targetStatus || ''}` ? 'Сохраняем...' : action.label}
                    </button>
                  ))}
                  {!actions.length ? <p className="empty-copy">{t('no_actions')}</p> : null}
                </div>
              </div>
            </>
          )}
        </DetailPanel>
      </div>
    </section>
  );
}
