import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { adminServiceApi } from '../api/adminServiceApi';
import { Icon, StatusBadge } from '../components/AdminUi';

const TABS = [
  { key: 'overview', label: 'Обзор' },
  { key: 'media', label: 'Фото и видео' },
  { key: 'history', label: 'История' },
  { key: 'service_cases', label: 'Сервисные кейсы' },
  { key: 'notes', label: 'Заметки' },
  { key: 'commercial', label: 'Коммерция' },
];

const COMMERCIAL_LABELS = {
  none: 'None',
  ready_for_issue: 'Ready for issue',
  issued_to_client: 'Issued to client',
  ready_for_rent: 'Ready for rent',
  reserved_for_rent: 'Reserved for rent',
  out_on_rent: 'Out on rent',
  out_on_replacement: 'Out on replacement',
  ready_for_sale: 'Ready for sale',
  reserved_for_sale: 'Reserved for sale',
  sold: 'Sold',
};

function formatDate(value) {
  return value ? new Date(value).toLocaleString('ru-RU') : '—';
}

function EquipmentListCard({ item, active, onClick }) {
  return (
    <button type="button" className={`equipment-ops-card ${active ? 'active' : ''}`} onClick={onClick}>
      <div className="equipment-ops-card__top">
        <strong>{item.id}</strong>
        <StatusBadge status={item.commercialStatus || 'none'}>{COMMERCIAL_LABELS[item.commercialStatus || 'none'] || (item.commercialStatus || 'none')}</StatusBadge>
      </div>
      <p>{item.brand || '—'} {item.model || ''}</p>
      <div className="equipment-ops-card__meta">
        <span><Icon name="clients" /> {item.clientName || 'Клиент не указан'}</span>
        <span><Icon name="equipment" /> {item.internalNumber || '—'} / {item.serial || '—'}</span>
      </div>
    </button>
  );
}

function MediaGallery({ rows = [], onOpen }) {
  const [filter, setFilter] = useState('all');
  const filtered = useMemo(
    () => rows.filter((item) => filter === 'all' || item.mediaType === filter),
    [rows, filter],
  );

  if (!rows.length) return <p className="empty-copy">Нет медиа по этому оборудованию.</p>;
  return (
    <div className="equipment-detail-section">
      <div className="quick-filter-row">
        {[
          { key: 'all', label: 'Все' },
          { key: 'photo', label: 'Фото' },
          { key: 'video', label: 'Видео' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            className={filter === item.key ? 'active' : ''}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="equipment-media-grid">
        {filtered.map((media, index) => (
          <button type="button" key={media.id || `${media.fullUrl || media.fileUrl}-${index}`} className="equipment-media-thumb" onClick={() => onOpen(rows.findIndex((item) => item.id === media.id))}>
            {media.mediaType === 'video'
              ? <video src={media.previewUrl || media.fullUrl} muted playsInline preload="metadata" />
              : <img src={media.previewUrl || media.fullUrl} alt={media.caption || media.originalName || 'media'} loading="lazy" />}
            <div>
              <strong>{media.caption || media.originalName || media.mediaType || 'media'}</strong>
              <span>{media.uploadedByUser?.fullName || media.uploadedBy || '—'} · {formatDate(media.createdAt)}</span>
              {media.serviceCaseId ? <span>Кейс: {media.serviceCaseId}</span> : null}
            </div>
          </button>
        ))}
        {!filtered.length ? <p className="empty-copy media-empty">По выбранному фильтру файлов нет.</p> : null}
      </div>
    </div>
  );
}

function Lightbox({ media, index, onClose }) {
  if (!media) return null;
  return (
    <div className="equipment-lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="equipment-lightbox__content" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="equipment-lightbox__close" onClick={onClose}>×</button>
        {media.mediaType === 'video'
          ? <video src={media.fullUrl || media.fileUrl} controls autoPlay />
          : <img src={media.fullUrl || media.fileUrl} alt={media.caption || media.originalName || `media-${index + 1}`} />}
        <p>{media.caption || media.originalName || '—'}</p>
        <small>{media.uploadedByUser?.fullName || media.uploadedBy || '—'} · {formatDate(media.createdAt)}</small>
        {media.serviceCaseId ? <small>Кейс: {media.serviceCaseId}</small> : null}
      </div>
    </div>
  );
}

function TabPanel({ tab, detail, onOpenMedia }) {
  if (!detail) return <p className="empty-copy">Выберите единицу оборудования.</p>;
  if (tab === 'overview') {
    const equipment = detail.equipment || {};
    const activeCase = detail.serviceCases?.find((item) => item.isActive) || null;
    return (
      <section className="equipment-detail-section">
        <div className="equipment-detail-grid">
          <p><Icon name="equipment" /> ID: {equipment.id || '—'}</p>
          <p><Icon name="clients" /> Клиент: {equipment.clientName || '—'}</p>
          <p><Icon name="equipment" /> Модель: {equipment.brand || '—'} {equipment.model || ''}</p>
          <p><Icon name="equipment" /> Internal/Serial: {equipment.internalNumber || '—'} / {equipment.serial || '—'}</p>
          <p><Icon name="service" /> Service: {equipment.serviceStatus || '—'}</p>
          <p><Icon name="sales" /> Commercial: {COMMERCIAL_LABELS[equipment.commercialStatus || 'none'] || (equipment.commercialStatus || 'none')}</p>
          <p><Icon name="dashboard" /> Active case: {activeCase?.id || '—'}</p>
          <p><Icon name="dashboard" /> Обновлено: {formatDate(equipment.updatedAt)}</p>
        </div>
      </section>
    );
  }
  if (tab === 'media') return <MediaGallery rows={detail.media || []} onOpen={onOpenMedia} />;
  if (tab === 'history') {
    const rows = detail.timeline || [];
    if (!rows.length) return <p className="empty-copy">История отсутствует.</p>;
    return (
      <ul className="equipment-history-list">
        {rows.map((row) => (
          <li key={row.id}>
            <p><strong>{row.type}:</strong> {row.payload?.fromStatus || '—'} → {row.payload?.toStatus || '—'}</p>
            <p>Actor: {row.actor || 'system'} · {formatDate(row.timestamp)}</p>
            <p>Comment: {row.comment || '—'}</p>
            {row.payload?.serviceCaseId ? <p>Case: {row.payload?.serviceCaseId}</p> : null}
            {row.payload?.raw ? <p>Legacy raw: {row.payload.raw?.fromStatusRaw || '—'} → {row.payload.raw?.toStatusRaw || '—'}</p> : null}
          </li>
        ))}
      </ul>
    );
  }
  if (tab === 'service_cases') {
    const rows = detail.serviceCases || [];
    if (!rows.length) return <p className="empty-copy">Кейсов не найдено.</p>;
    return (
      <div className="equipment-cases-list">
        {detail.activeServiceCaseId ? <p>Активный кейс: <strong>{detail.activeServiceCaseId}</strong></p> : <p>Активный кейс отсутствует.</p>}
        {rows.map((row) => (
          <article key={row.id} className="equipment-case-card">
            <header>
              <strong>{row.id}</strong>
              {row.isActive ? <span className="signal-chip signal-chip--critical">active case</span> : null}
            </header>
            <p>Status: {row.serviceStatus || '—'}</p>
            <p>Created: {formatDate(row.createdAt)} · Updated: {formatDate(row.updatedAt)}</p>
            <a href={`/admin/service?caseId=${encodeURIComponent(row.id)}`}>Открыть detail case view: {row.id}</a>
          </article>
        ))}
      </div>
    );
  }
  if (tab === 'notes') {
    const rows = detail.notes || [];
    if (!rows.length) return <p className="empty-copy">Заметок пока нет.</p>;
    return (
      <ul className="equipment-notes-list">
        {rows.map((row) => (
          <li key={row.id}>
            <p>{row.body}</p>
            <small>{row.authorUser?.fullName || '—'} · {formatDate(row.createdAt)} · case {row.serviceCaseId || '—'}</small>
          </li>
        ))}
      </ul>
    );
  }

  const actions = detail.currentActions?.all || [];
  return (
    <section className="equipment-detail-section">
      <p>Текущий commercial status: {COMMERCIAL_LABELS[detail.equipment?.commercialStatus || 'none'] || (detail.equipment?.commercialStatus || 'none')}</p>
      <div className="quick-filter-row">
        {actions.map((action) => <span key={action.key + action.targetStatus} className="signal-chip signal-chip--warning">{action.label}</span>)}
        {!actions.length ? <span className="empty-copy">Нет доступных действий.</span> : null}
      </div>
    </section>
  );
}

export function AdminEquipmentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { equipmentId } = useParams();

  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.matchMedia('(max-width: 980px)').matches : false));

  useEffect(() => {
    const query = typeof window !== 'undefined' ? window.matchMedia('(max-width: 980px)') : null;
    if (!query) return undefined;
    const listener = (event) => setIsMobile(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  async function loadList() {
    const payload = await adminServiceApi.equipmentList();
    const rows = payload.items || [];
    setItems(rows);
    if (equipmentId) {
      setSelectedId(equipmentId);
      return;
    }
    if (!isMobile) setSelectedId((prev) => prev || rows[0]?.id || null);
  }

  async function loadDetail(id) {
    if (!id) return setDetail(null);
    const payload = await adminServiceApi.equipmentDetail(id);
    setDetail(payload.item || null);
  }

  useEffect(() => { loadList().catch(() => setItems([])); }, [searchParams, equipmentId, isMobile]); // eslint-disable-line
  useEffect(() => {
    const targetId = equipmentId || selectedId;
    loadDetail(targetId).catch(() => setDetail(null));
  }, [equipmentId, selectedId]);

  const mediaRows = useMemo(() => (detail?.media || []).slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [detail]);

  function selectEquipment(id) {
    if (isMobile) {
      const basePath = location.pathname.startsWith('/tg/admin') ? '/tg/admin' : '/admin';
      navigate(`${basePath}/equipment/${id}`);
      return;
    }
    setSelectedId(id);
  }

  function closeMobileDetail() {
    const basePath = location.pathname.startsWith('/tg/admin') ? '/tg/admin' : '/admin';
    navigate(`${basePath}/equipment`);
  }

  const mobileDetailMode = isMobile && Boolean(equipmentId);

  return (
    <section className="equipment-ops-page">
      <header className="service-headline">
        <div>
          <h2>Operations Asset View</h2>
          <p>Краткий список оборудования + полноценная деталка с timeline, медиа и коммерческим контекстом.</p>
        </div>
      </header>

      <div className={`equipment-ops-layout ${mobileDetailMode ? 'mobile-detail' : ''}`}>
        {!mobileDetailMode ? (
          <aside className="equipment-ops-list">
            {items.map((item) => (
              <EquipmentListCard
                key={item.id}
                item={item}
                active={(equipmentId || selectedId) === item.id}
                onClick={() => selectEquipment(item.id)}
              />
            ))}
            {!items.length ? <p className="empty-copy">Нет оборудования.</p> : null}
          </aside>
        ) : null}

        <article className="equipment-ops-detail">
          {mobileDetailMode ? <button type="button" className="equipment-back-button" onClick={closeMobileDetail}>← Назад к списку</button> : null}
          <header className="equipment-ops-detail__header">
            <h3>{detail?.equipment?.id || 'Выберите оборудование'}</h3>
            {detail?.equipment ? <StatusBadge status={detail.equipment.commercialStatus || 'none'}>{COMMERCIAL_LABELS[detail.equipment.commercialStatus || 'none'] || detail.equipment.commercialStatus}</StatusBadge> : null}
          </header>

          <div className="equipment-tabs">
            {TABS.map((tab) => (
              <button key={tab.key} type="button" className={activeTab === tab.key ? 'active' : ''} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
            ))}
          </div>

          <TabPanel tab={activeTab} detail={{ ...detail, media: mediaRows }} onOpenMedia={setLightboxIndex} />
        </article>
      </div>

      <Lightbox media={mediaRows[lightboxIndex]} index={lightboxIndex} onClose={() => setLightboxIndex(-1)} />
    </section>
  );
}
