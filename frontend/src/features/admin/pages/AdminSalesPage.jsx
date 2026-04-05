import { useEffect, useMemo, useState } from 'react';
import { adminServiceApi } from '../api/adminServiceApi';
import { DetailPanel, Icon, StatusBadge } from '../components/AdminUi';

const SALES_COLUMNS = ['ready_for_rent', 'reserved_for_rent', 'out_on_rent', 'out_on_replacement', 'ready_for_sale', 'reserved_for_sale', 'sold'];
const LABELS = {
  ready_for_rent: 'Готово к аренде',
  reserved_for_rent: 'Бронь аренды',
  out_on_rent: 'В аренде',
  out_on_replacement: 'На подмене',
  ready_for_sale: 'Готово к продаже',
  reserved_for_sale: 'Бронь продажи',
  sold: 'Продано',
};

function formatDate(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }

function SalesCard({ item, active, onSelect }) {
  const status = item.equipment?.commercialStatus || 'none';
  return (
    <button type="button" className={`ticket-card ${active ? 'active' : ''}`} onClick={() => onSelect(item.id)}>
      <i className="ticket-strip" data-status={item.serviceStatus} />
      <div className="ticket-top"><StatusBadge status={item.serviceStatus}>{item.serviceStatus}</StatusBadge><small>#{item.id}</small></div>
      <strong>{item.equipment?.clientName || 'Клиент'}</strong>
      <p>{item.equipment?.brand || '—'} {item.equipment?.model || ''}</p>
      <div className="ticket-tags"><em>{LABELS[status] || status}</em></div>
      <div className="ticket-meta"><span>🕒 {formatDate(item.updatedAt)}</span></div>
    </button>
  );
}

export function AdminSalesPage() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const list = await adminServiceApi.serviceCases({ serviceStatus: '' });
      const filtered = (list.items || []).filter((row) => SALES_COLUMNS.includes(row.equipment?.commercialStatus || 'none'));
      setItems(filtered);
      setSelectedId((prev) => prev || filtered[0]?.id || null);
      setError('');
    } catch {
      setError('Не удалось загрузить sales board.');
    }
  }

  async function loadDetails(id) {
    const payload = await adminServiceApi.serviceCaseById(id);
    setSelectedRequest(payload.item || null);
  }

  async function applyCommercial(status) {
    const equipmentId = selectedRequest?.equipmentId;
    if (!equipmentId) return;
    await adminServiceApi.updateCommercialStatus(equipmentId, status, '', selectedId);
    await load();
    await loadDetails(selectedId);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => {
    if (!selectedId) return setSelectedRequest(null);
    loadDetails(selectedId).catch(() => setSelectedRequest(null));
  }, [selectedId]);

  const columns = useMemo(() => SALES_COLUMNS.map((status) => ({
    status,
    label: LABELS[status],
    items: items.filter((row) => (row.equipment?.commercialStatus || 'none') === status),
  })), [items]);

  return (
    <section className="service-dashboard">
      <header className="service-headline"><div><h2>Sales Board</h2><p>Commercial handoff board для salesManager.</p></div></header>
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
          {!selectedRequest ? <p>Выберите кейс.</p> : (
            <>
              <header className="detail-header"><h3>Case #{selectedRequest.id}</h3><StatusBadge status={selectedRequest.equipment?.commercialStatus || 'none'}>{LABELS[selectedRequest.equipment?.commercialStatus || 'none'] || (selectedRequest.equipment?.commercialStatus || 'none')}</StatusBadge></header>
              <div className="detail-grid">
                <p><Icon name="clients" /> Клиент: {selectedRequest.equipment?.clientName || '—'}</p>
                <p><Icon name="equipment" /> Оборудование: {selectedRequest.equipment?.brand || '—'} {selectedRequest.equipment?.model || ''}</p>
                <p><Icon name="service" /> Service status: {selectedRequest.serviceStatus}</p>
                <p><Icon name="sales" /> Обновлено: {formatDate(selectedRequest.updatedAt)}</p>
              </div>

              <div className="assignment-box">
                <h4>Commercial actions</h4>
                <div className="quick-filter-row">
                  {(selectedRequest.availableCommercialActions || []).map((status) => (
                    <button key={status} type="button" onClick={() => applyCommercial(status).catch(() => setError('Коммерческий переход запрещен.'))}>→ {LABELS[status] || status}</button>
                  ))}
                  {!(selectedRequest.availableCommercialActions || []).length ? <p className="empty-copy">Нет доступных действий.</p> : null}
                </div>
              </div>
            </>
          )}
        </DetailPanel>
      </div>
    </section>
  );
}
