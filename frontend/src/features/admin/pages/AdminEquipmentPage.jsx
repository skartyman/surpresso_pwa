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
  none: 'Без статуса',
  ready_for_issue: 'Готово к выдаче',
  issued_to_client: 'Выдано клиенту',
  ready_for_rent: 'Готово к аренде',
  reserved_for_rent: 'Зарезервировано под аренду',
  out_on_rent: 'В аренде',
  out_on_replacement: 'На подмене',
  ready_for_sale: 'Готово к продаже',
  reserved_for_sale: 'Зарезервировано к продаже',
  sold: 'Продано',
};

const EVENT_META = {
  service_status_changed: { label: 'Изменён сервисный статус', tone: 'service', icon: 'service' },
  commercial_status_changed: { label: 'Изменён коммерческий статус', tone: 'commercial', icon: 'sales' },
  assignment: { label: 'Назначение', tone: 'assignment', icon: 'employees' },
  processed: { label: 'Обработано', tone: 'processed', icon: 'dashboard' },
  media_uploaded: { label: 'Медиа загружено', tone: 'media', icon: 'content' },
  note_added: { label: 'Добавлена заметка', tone: 'note', icon: 'content' },
  legacy_event: { label: 'Событие из legacy-системы', tone: 'legacy', icon: 'bell' },
};

function formatDate(value) {
  return value ? new Date(value).toLocaleString('ru-RU') : '—';
}

function formatDay(value) {
  return value ? new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Без даты';
}

function isUrlLike(value = '') {
  return /^https?:\/\//i.test(String(value).trim());
}

function getMediaDisplayTitle(media, fallback = 'Медиафайл') {
  if (media?.caption?.trim()) return media.caption.trim();
  if (media?.originalName?.trim() && !isUrlLike(media.originalName)) return media.originalName.trim();
  return media?.mediaType === 'video' ? 'Видео' : (media?.mediaType === 'photo' ? 'Фото' : fallback);
}

function getBaseAdminPath(pathname = '') {
  return pathname.startsWith('/tg/admin') ? '/tg/admin' : '/admin';
}

function getEquipmentWarnings(detail) {
  const warnings = [];
  const activeCase = detail?.serviceCases?.find((item) => item.isActive) || null;
  const staleReady = activeCase?.serviceStatus === 'ready' && activeCase.updatedAt
    ? (Date.now() - new Date(activeCase.updatedAt).getTime()) > 24 * 3600000
    : false;
  if (!activeCase) warnings.push('Нет активного сервисного кейса');
  if (!detail?.equipment?.serial) warnings.push('Серийный номер не заполнен');
  if (staleReady) warnings.push('Кейс в статусе ready более 24ч');
  if ((detail?.media || []).length === 0) warnings.push('Нет медиафайлов');
  return warnings;
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
  const [typeFilter, setTypeFilter] = useState('all');
  const [caseFilter, setCaseFilter] = useState('all');

  useEffect(() => {
    setCaseFilter('all');
    setTypeFilter('all');
  }, [rows]);

  const caseOptions = useMemo(() => {
    const values = Array.from(new Set(rows.map((item) => item.serviceCaseId).filter(Boolean)));
    return values.sort((a, b) => String(b).localeCompare(String(a), 'ru-RU'));
  }, [rows]);

  const filtered = useMemo(() => rows.filter((item) => {
    if (typeFilter !== 'all' && item.mediaType !== typeFilter) return false;
    if (caseFilter !== 'all' && (item.serviceCaseId || 'no_case') !== caseFilter) return false;
    return true;
  }), [rows, typeFilter, caseFilter]);

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((item) => {
      const day = formatDay(item.createdAt);
      if (!map.has(day)) map.set(day, []);
      map.get(day).push(item);
    });
    return Array.from(map.entries());
  }, [filtered]);

  if (!rows.length) return <p className="empty-copy">Нет медиа по этому оборудованию.</p>;

  return (
    <div className="equipment-detail-section">
      <div className="equipment-media-filters">
        <div className="quick-filter-row">
          {[
            { key: 'all', label: 'Все' },
            { key: 'photo', label: 'Фото' },
            { key: 'video', label: 'Видео' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className={typeFilter === item.key ? 'active' : ''}
              onClick={() => setTypeFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="quick-filter-row">
          <button type="button" className={caseFilter === 'all' ? 'active' : ''} onClick={() => setCaseFilter('all')}>Все кейсы</button>
          <button type="button" className={caseFilter === 'no_case' ? 'active' : ''} onClick={() => setCaseFilter('no_case')}>Без кейса</button>
          {caseOptions.map((serviceCaseId) => (
            <button key={serviceCaseId} type="button" className={caseFilter === serviceCaseId ? 'active' : ''} onClick={() => setCaseFilter(serviceCaseId)}>
              Кейс {serviceCaseId}
            </button>
          ))}
        </div>
      </div>

      {grouped.map(([day, dayItems]) => (
        <section key={day} className="equipment-media-group">
          <h4>{day}</h4>
          <div className="equipment-media-grid">
            {dayItems.map((media) => {
              const originalIndex = rows.findIndex((item) => item.id === media.id);
              return (
                <button type="button" key={media.id || `${media.fullUrl || media.fileUrl}-${day}`} className="equipment-media-thumb" onClick={() => onOpen(originalIndex)}>
                  {media.mediaType === 'video'
                    ? <video src={media.previewUrl || media.fullUrl} muted playsInline preload="metadata" />
                    : <img src={media.previewUrl || media.fullUrl} alt={media.caption || media.originalName || 'media'} loading="lazy" />}
                  <div>
                    <strong>{getMediaDisplayTitle(media)}</strong>
                    <span>{media.uploadedByUser?.fullName || media.uploadedBy || '—'} · {formatDate(media.createdAt)}</span>
                    <span>{media.mediaType === 'video' ? 'Видео' : 'Фото'} · {media.serviceCaseId ? `Кейс: ${media.serviceCaseId}` : 'Без кейса'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {!grouped.length ? <p className="empty-copy media-empty">По выбранному фильтру файлов нет.</p> : null}
    </div>
  );
}

function Lightbox({ rows = [], index, onClose, onNavigate }) {
  const media = rows[index];
  if (!media) return null;

  return (
    <div className="equipment-lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="equipment-lightbox__content" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="equipment-lightbox__close" onClick={onClose}>×</button>
        <div className="equipment-lightbox__controls">
          <button type="button" onClick={() => onNavigate(-1)} disabled={index <= 0}>←</button>
          <small>{index + 1} / {rows.length}</small>
          <button type="button" onClick={() => onNavigate(1)} disabled={index >= rows.length - 1}>→</button>
        </div>
        {media.mediaType === 'video'
          ? <video src={media.fullUrl || media.fileUrl} controls autoPlay />
          : <img src={media.fullUrl || media.fileUrl} alt={media.caption || media.originalName || `media-${index + 1}`} />}
        <div className="equipment-lightbox__meta">
          <p>{getMediaDisplayTitle(media, '—')}</p>
          <small>{media.uploadedByUser?.fullName || media.uploadedBy || '—'} · {formatDate(media.createdAt)}</small>
          {media.serviceCaseId ? <small>Кейс: {media.serviceCaseId}</small> : null}
          <a href={media.fullUrl || media.fileUrl} target="_blank" rel="noreferrer">Открыть оригинал в новой вкладке</a>
        </div>
        <div className="equipment-lightbox__carousel">
          {rows.map((item, thumbIndex) => (
            <button type="button" key={item.id || `${item.fullUrl || item.fileUrl}-${thumbIndex}`} className={thumbIndex === index ? 'active' : ''} onClick={() => onNavigate(thumbIndex - index)}>
              {item.mediaType === 'video'
                ? <video src={item.previewUrl || item.fullUrl} muted playsInline preload="metadata" />
                : <img src={item.previewUrl || item.fullUrl} alt={item.caption || item.originalName || `thumb-${thumbIndex + 1}`} loading="lazy" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineView({ rows = [] }) {
  if (!rows.length) return <p className="empty-copy">История отсутствует.</p>;
  const normalized = [...rows].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

  return (
    <ul className="equipment-history-list equipment-history-list--typed">
      {normalized.map((row) => {
        const meta = EVENT_META[row.type] || EVENT_META.legacy_event;
        return (
          <li key={row.id} className={`event-item event-item--${meta.tone}`}>
            <header>
              <span className="event-item__badge">
                <Icon name={meta.icon} /> {meta.label}
              </span>
              <small>{formatDate(row.timestamp)}</small>
            </header>
            <p><strong>{row.payload?.fromStatus || '—'} → {row.payload?.toStatus || '—'}</strong></p>
            <p>{row.comment || 'Без комментария'}</p>
            <small>Автор: {row.actor || 'system'}{row.payload?.serviceCaseId ? ` · кейс ${row.payload.serviceCaseId}` : ''}</small>
          </li>
        );
      })}
    </ul>
  );
}

function ActionPanel({ detail, onQuickMediaUploaded, navigateToBoard, basePath }) {
  const [actionLoading, setActionLoading] = useState('');
  const [quickMediaFiles, setQuickMediaFiles] = useState([]);
  const [quickMediaCaption, setQuickMediaCaption] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const activeCase = detail?.serviceCases?.find((item) => item.isActive) || null;
  const commercialActions = detail?.currentActions?.all?.filter((item) => item.type === 'commercial') || [];

  async function applyCommercialAction(action) {
    if (!detail?.equipment?.id || !action) return;
    setActionLoading(`commercial:${action.key}:${action.targetStatus || ''}`);
    setError('');
    try {
      if (action.key === 'reserve-rent') {
        await adminServiceApi.reserveRent(detail.equipment.id, activeCase?.id || null);
      } else if (action.key === 'reserve-sale') {
        await adminServiceApi.reserveSale(detail.equipment.id, activeCase?.id || null);
      } else {
        await adminServiceApi.updateCommercialStatus(detail.equipment.id, action.targetStatus, '', activeCase?.id || null);
      }
      setFeedback('Коммерческое действие выполнено. Обновите карточку оборудования из списка для актуальных данных.');
    } catch {
      setError('Не удалось выполнить коммерческое действие.');
    } finally {
      setActionLoading('');
    }
  }

  async function submitQuickMedia() {
    if (!activeCase?.id || !quickMediaFiles.length) return;
    setActionLoading('media');
    setError('');
    try {
      await adminServiceApi.uploadServiceCaseMedia(activeCase.id, quickMediaFiles, quickMediaCaption.trim());
      setQuickMediaFiles([]);
      setQuickMediaCaption('');
      setFeedback('Медиа добавлено в активный кейс.');
      await onQuickMediaUploaded?.();
    } catch {
      setError('Не удалось загрузить медиа.');
    } finally {
      setActionLoading('');
    }
  }

  return (
    <section className="equipment-detail-section equipment-action-panel">
      <header>
        <h4>Панель действий</h4>
        <p>Операционные действия по оборудованию без перехода между экранами.</p>
      </header>

      <div className="quick-filter-row">
        <button type="button" disabled={!activeCase?.id} onClick={() => activeCase?.id && navigateToBoard('service_case', activeCase.id)}>
          Открыть активный сервисный кейс
        </button>
        <button type="button" onClick={() => navigateToBoard('service_flow', detail?.equipment?.id)}>
          Создать/открыть сервисный поток
        </button>
        <button type="button" onClick={() => navigateToBoard('service_board', detail?.equipment?.id)}>
          Сервисная доска
        </button>
        <button type="button" onClick={() => navigateToBoard('director_board', detail?.equipment?.id)}>
          Доска директора
        </button>
        <button type="button" onClick={() => navigateToBoard('sales_board', detail?.equipment?.id)}>
          Доска продаж
        </button>
      </div>

      <div className="equipment-action-panel__media">
        <h5>Быстрое добавление медиа</h5>
        {!activeCase?.id ? <p className="empty-copy">Активный кейс не найден — быстрая загрузка недоступна.</p> : null}
        <input type="file" multiple accept="image/*,video/*" onChange={(event) => setQuickMediaFiles(Array.from(event.target.files || []))} />
        <input
          type="text"
          value={quickMediaCaption}
          onChange={(event) => setQuickMediaCaption(event.target.value)}
          placeholder="Комментарий к медиа"
        />
        <button
          type="button"
          className="equipment-action-panel__upload-btn"
          disabled={!activeCase?.id || !quickMediaFiles.length || Boolean(actionLoading)}
          onClick={() => submitQuickMedia()}
        >
          {actionLoading === 'media' ? 'Загрузка...' : 'Загрузить медиа в активный кейс'}
        </button>
      </div>

      <div className="equipment-action-panel__commercial">
        <h5>Быстрые коммерческие действия</h5>
        <div className="quick-filter-row">
          {commercialActions.map((action) => (
            <button
              disabled={Boolean(actionLoading)}
              key={action.key + action.targetStatus}
              type="button"
              onClick={() => applyCommercialAction(action)}
            >
              {actionLoading === `commercial:${action.key}:${action.targetStatus || ''}` ? 'Сохраняем...' : action.label}
            </button>
          ))}
          {!commercialActions.length ? <span className="empty-copy">Нет доступных действий.</span> : null}
        </div>
      </div>

      <p className="equipment-action-panel__links">
        Быстрые ссылки: <a href={`${basePath}/service`}>Сервисная доска</a> · <a href={`${basePath}/director`}>Доска директора</a> · <a href={`${basePath}/sales`}>Доска продаж</a>
      </p>
      {feedback ? <p>{feedback}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}

function TabPanel({ tab, detail, onOpenMedia, onRefreshDetail, navigateToBoard, basePath }) {
  if (!detail) return <p className="empty-copy">Выберите единицу оборудования.</p>;
  if (tab === 'overview') {
    const equipment = detail.equipment || {};
    const activeCase = detail.serviceCases?.find((item) => item.isActive) || null;
    const latestMedia = (detail.media || [])[0] || null;
    const warnings = getEquipmentWarnings(detail);
    return (
      <section className="equipment-detail-section">
        <article className="equipment-summary-hero">
          <div>
            <h4>{equipment.brand || '—'} {equipment.model || ''}</h4>
            <p>{equipment.id || '—'} · {equipment.internalNumber || '—'} / {equipment.serial || '—'}</p>
            <div className="equipment-summary-hero__statuses">
              <StatusBadge status={activeCase?.serviceStatus || equipment.serviceStatus || 'none'}>Сервис: {activeCase?.serviceStatus || equipment.serviceStatus || '—'}</StatusBadge>
              <StatusBadge status={equipment.commercialStatus || 'none'}>Коммерция: {COMMERCIAL_LABELS[equipment.commercialStatus || 'none'] || (equipment.commercialStatus || 'none')}</StatusBadge>
            </div>
          </div>
          {latestMedia
            ? (
              <button type="button" className="equipment-summary-hero__preview" onClick={() => onOpenMedia(0)}>
                {latestMedia.mediaType === 'video'
                  ? <video src={latestMedia.previewUrl || latestMedia.fullUrl} muted playsInline preload="metadata" />
                  : <img src={latestMedia.previewUrl || latestMedia.fullUrl} alt={latestMedia.caption || latestMedia.originalName || 'последнее медиа'} loading="lazy" />}
              </button>
            )
            : <div className="equipment-summary-hero__preview equipment-summary-hero__preview--empty">Нет превью</div>}
        </article>

        {warnings.length ? (
          <div className="warning-badges">
            {warnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        ) : null}

        <div className="equipment-detail-grid">
          <p><Icon name="clients" /> Клиент: {equipment.clientName || '—'}</p>
          <p><Icon name="equipment" /> Тип владельца: {equipment.ownerType || '—'}</p>
          <p><Icon name="dashboard" /> Активный кейс: {activeCase?.id || '—'}</p>
          <p><Icon name="employees" /> Назначенный мастер: {activeCase?.assignedToUser?.fullName || activeCase?.assignedToUserId || '—'}</p>
          <p><Icon name="service" /> Текущий сервисный статус: {activeCase?.serviceStatus || equipment.serviceStatus || '—'}</p>
          <p><Icon name="sales" /> Текущий коммерческий статус: {COMMERCIAL_LABELS[equipment.commercialStatus || 'none'] || (equipment.commercialStatus || 'none')}</p>
          <p><Icon name="dashboard" /> Обновлено: {formatDate(equipment.updatedAt)}</p>
        </div>

        <ActionPanel
          detail={detail}
          onQuickMediaUploaded={onRefreshDetail}
          navigateToBoard={navigateToBoard}
          basePath={basePath}
        />
      </section>
    );
  }
  if (tab === 'media') return <MediaGallery rows={detail.media || []} onOpen={onOpenMedia} />;
  if (tab === 'history') return <TimelineView rows={detail.timeline || []} />;
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
              {row.isActive ? <span className="signal-chip signal-chip--critical">активный кейс</span> : null}
            </header>
            <p>Статус: {row.serviceStatus || '—'}</p>
            <p>Назначен: {row.assignedToUser?.fullName || row.assignedToUserId || '—'}</p>
            <p>Создан: {formatDate(row.createdAt)} · Обновлён: {formatDate(row.updatedAt)}</p>
            <a href={`${basePath}/service?caseId=${encodeURIComponent(row.id)}`}>Открыть детальный просмотр кейса: {row.id}</a>
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
            <small>{row.authorUser?.fullName || '—'} · {formatDate(row.createdAt)} · кейс {row.serviceCaseId || '—'}</small>
          </li>
        ))}
      </ul>
    );
  }

  const actions = detail.currentActions?.all || [];
  return (
    <section className="equipment-detail-section">
      <p>Текущий коммерческий статус: {COMMERCIAL_LABELS[detail.equipment?.commercialStatus || 'none'] || (detail.equipment?.commercialStatus || 'none')}</p>
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

  const basePath = getBaseAdminPath(location.pathname);

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
      navigate(`${basePath}/equipment/${id}`);
      return;
    }
    setSelectedId(id);
  }

  function closeMobileDetail() {
    navigate(`${basePath}/equipment`);
  }

  function navigateToBoard(target, id) {
    const equipmentKey = id || detail?.equipment?.id || '';
    if (target === 'service_case' && id) {
      navigate(`${basePath}/service?caseId=${encodeURIComponent(id)}`);
      return;
    }
    if (target === 'service_flow' || target === 'service_board') {
      navigate(`${basePath}/service${equipmentKey ? `?equipmentId=${encodeURIComponent(equipmentKey)}` : ''}`);
      return;
    }
    if (target === 'director_board') {
      navigate(`${basePath}/director${equipmentKey ? `?equipmentId=${encodeURIComponent(equipmentKey)}&commercialStatus=route_backlog` : ''}`);
      return;
    }
    if (target === 'sales_board') {
      navigate(`${basePath}/sales${equipmentKey ? `?equipmentId=${encodeURIComponent(equipmentKey)}` : ''}`);
    }
  }

  const mobileDetailMode = isMobile && Boolean(equipmentId);

  return (
    <section className="equipment-ops-page">
      <header className="service-headline">
        <div>
          <h2>Операционный реестр оборудования</h2>
          <p>Краткий список оборудования + полноценная детализация в формате операционного паспорта.</p>
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

          <TabPanel
            tab={activeTab}
            detail={{ ...detail, media: mediaRows }}
            onOpenMedia={setLightboxIndex}
            onRefreshDetail={() => loadDetail(detail?.equipment?.id || equipmentId || selectedId)}
            navigateToBoard={navigateToBoard}
            basePath={basePath}
          />
        </article>
      </div>

      <Lightbox
        rows={mediaRows}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(-1)}
        onNavigate={(delta) => setLightboxIndex((prev) => Math.min(Math.max(prev + delta, 0), mediaRows.length - 1))}
      />
    </section>
  );
}
