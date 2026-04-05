import { useEffect, useMemo, useState } from 'react';
import { adminServiceApi } from '../api/adminServiceApi';
import { DetailPanel, Icon, StatusBadge } from '../components/AdminUi';

const SALES_COLUMNS = ['ready_for_rent', 'reserved_for_rent', 'out_on_rent', 'out_on_replacement', 'ready_for_sale', 'reserved_for_sale', 'sold'];
const LABELS = {
  ready_for_rent: 'Ready for rent',
  reserved_for_rent: 'Reserved for rent',
  out_on_rent: 'Out on rent',
  out_on_replacement: 'Out on replacement',
  ready_for_sale: 'Ready for sale',
  reserved_for_sale: 'Reserved for sale',
  sold: 'Sold',
};

function formatDate(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }

function SalesCard({ item, active, onSelect }) {
  const status = item.commercialStatus || 'none';
  return (
    <button type="button" className={`ticket-card ${active ? 'active' : ''}`} onClick={() => onSelect(item.id)}>
      <i className="ticket-strip" data-status={status} />
      <div className="ticket-top"><StatusBadge status={status}>{LABELS[status] || status}</StatusBadge><small>{item.id}</small></div>
      <strong>{item.clientName || 'Клиент'}</strong>
      <p>{item.brand || '—'} {item.model || ''}</p>
      <div className="ticket-meta"><span>🕒 {formatDate(item.updatedAt)}</span></div>
    </button>
  );
}

export function AdminSalesPage() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [relatedCases, setRelatedCases] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    try {
      const payload = await adminServiceApi.salesEquipment();
      const rows = payload.items || [];
      setItems(rows);
      setSelectedId((prev) => prev || rows[0]?.id || null);
      setError('');
    } catch {
      setError('Не удалось загрузить sales board.');
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

  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => {
    if (!selectedId) return setSelectedEquipment(null);
    loadDetails(selectedId).catch(() => {
      setSelectedEquipment(null);
      setRelatedCases([]);
    });
  }, [selectedId]);

  const columns = useMemo(() => SALES_COLUMNS.map((status) => ({
    status,
    label: LABELS[status],
    items: items.filter((row) => (row.commercialStatus || 'none') === status),
  })), [items]);

  const caseHint = relatedCases[0] || null;
  const caseId = caseHint?.id || null;
  const actions = selectedEquipment?.nextActions?.all || [];

  async function performAction(actionKey, targetStatus) {
    if (!selectedId) return;
    if (actionKey === 'reserve-rent') {
      await adminServiceApi.reserveRent(selectedId, caseId);
    } else if (actionKey === 'reserve-sale') {
      await adminServiceApi.reserveSale(selectedId, caseId);
    } else {
      await adminServiceApi.updateCommercialStatus(selectedId, targetStatus, '', caseId);
    }
    await load();
    await loadDetails(selectedId);
  }

  return (
    <section className="service-dashboard">
      <header className="service-headline"><div><h2>Sales Board</h2><p>Action-based commercial workflow для salesManager.</p></div></header>
      {error ? <p className="error-text">{error}</p> : null}

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
          {!selectedEquipment ? <p>Выберите оборудование.</p> : (
            <>
              <header className="detail-header"><h3>{selectedEquipment.id}</h3><StatusBadge status={selectedEquipment.commercialStatus || 'none'}>{LABELS[selectedEquipment.commercialStatus || 'none'] || (selectedEquipment.commercialStatus || 'none')}</StatusBadge></header>
              <div className="detail-grid">
                <p><Icon name="clients" /> Клиент: {selectedEquipment.clientName || '—'}</p>
                <p><Icon name="equipment" /> Оборудование: {selectedEquipment.brand || '—'} {selectedEquipment.model || ''}</p>
                <p><Icon name="service" /> Service status: {selectedEquipment.serviceStatus || '—'}</p>
                <p><Icon name="sales" /> Обновлено: {formatDate(selectedEquipment.updatedAt)}</p>
              </div>

              <div className="assignment-box">
                <h4>Commercial actions</h4>
                <div className="quick-filter-row">
                  {actions.map((action) => (
                    <button key={action.key + action.targetStatus} type="button" onClick={() => performAction(action.key, action.targetStatus).catch(() => setError('Коммерческий переход запрещен.'))}>
                      {action.label}
                    </button>
                  ))}
                  {!actions.length ? <p className="empty-copy">Нет доступных действий.</p> : null}
                </div>
              </div>
            </>
          )}
        </DetailPanel>
      </div>
    </section>
  );
}
