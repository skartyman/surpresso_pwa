import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { adminServiceApi } from '../api/adminServiceApi';
import { ActionRail, ActionRailButton, Icon, KPIChipCard, StatusBadge } from '../components/AdminUi';
import { ROLES } from '../roleConfig';
import { getEquipmentCardCover, setEquipmentCardCover } from '../utils/equipmentCardCover';

const TABS = [
  { key: 'overview', label: 'Обзор' },
  { key: 'media', label: 'Фото и видео' },
  { key: 'history', label: 'История' },
  { key: 'service_cases', label: 'Сервисные кейсы' },
  { key: 'tasks', label: 'Задачи' },
  { key: 'comments', label: 'Комментарии' },
  { key: 'notes', label: 'Заметки' },
  { key: 'commercial', label: 'Коммерция' },
  { key: 'documents', label: 'Документы' },
];

const COMMERCIAL_LABELS = {
  none: 'Без статуса',
  ready_for_issue: 'Готово к выдаче',
  issued_to_client: 'У клиента',
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

const ALERT_LABELS = {
  missing_serial_for_client: 'Клиентская техника без серийного номера',
  missing_internal_for_company: 'Техника компании без внутреннего номера',
  missing_media: 'Нет медиафайлов',
  missing_active_service_case: 'Без активного сервисного кейса',
  stale_ready: 'Кейс в статусе «Готово» более 24 ч',
  inconsistent_status_data: 'Несогласованные статусные данные',
};

const ALERT_TONES = {
  missing_serial_for_client: 'warning',
  missing_internal_for_company: 'warning',
  missing_media: 'warning',
  missing_active_service_case: 'warning',
  stale_ready: 'critical',
  inconsistent_status_data: 'critical',
};

const EQUIPMENT_LIST_FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'in_service', label: 'В сервисе' },
  { key: 'ready', label: 'Готово' },
  { key: 'rent', label: 'Аренда' },
  { key: 'sale', label: 'Продажа' },
  { key: 'client', label: 'У клиента' },
  { key: 'attention', label: 'Требует внимания' },
];

const RENT_STATUSES = new Set(['ready_for_rent', 'reserved_for_rent', 'out_on_rent', 'out_on_replacement']);
const SALE_STATUSES = new Set(['ready_for_sale', 'reserved_for_sale', 'sold']);

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
  if (media?.caption?.trim() && !isUrlLike(media.caption)) return media.caption.trim();
  if (media?.originalName?.trim() && !isUrlLike(media.originalName)) return media.originalName.trim();
  return media?.mediaType === 'video' ? 'Видео' : (media?.mediaType === 'photo' ? 'Фото' : fallback);
}

function hasRenderableMedia(media) {
  const preview = String(media?.previewUrl || media?.fullUrl || media?.fileUrl || '').trim();
  return Boolean(preview);
}

function getBaseAdminPath(pathname = '') {
  return pathname.startsWith('/tg/admin') ? '/tg/admin' : '/admin';
}

function getEquipmentWarnings(detail) {
  const warnings = [];
  const equipment = detail?.equipment || {};
  const ownerType = String(equipment.ownerType || '').trim();
  const activeCase = detail?.serviceCases?.find((item) => item.isActive) || null;
  const staleReady = activeCase?.serviceStatus === 'ready' && activeCase.updatedAt
    ? (Date.now() - new Date(activeCase.updatedAt).getTime()) > 24 * 3600000
    : false;
  if (!activeCase) warnings.push('missing_active_service_case');
  if (ownerType === 'client' && !equipment.serial) warnings.push('missing_serial_for_client');
  if (ownerType === 'company' && !equipment.internalNumber) warnings.push('missing_internal_for_company');
  if (staleReady) warnings.push('stale_ready');
  if ((detail?.media || []).length === 0) warnings.push('missing_media');
  if (activeCase && equipment.serviceStatus && activeCase.serviceStatus !== equipment.serviceStatus) warnings.push('inconsistent_status_data');
  return warnings.map((key) => ALERT_LABELS[key] || key);
}

function DashboardHeader({ dashboard, onAlertClick, activeWarning }) {
  const kpi = dashboard?.kpi || {};
  const alertRows = dashboard?.alerts || [];

  return (
    <div className="equipment-hub-header">
      <div className="equipment-hub-kpi-grid">
        <KPIChipCard label="Всего техники" value={kpi.totalEquipment || 0} icon="equipment" hint="Парк в реестре" tone="info" />
        <KPIChipCard label="В сервисе" value={kpi.inService || 0} icon="service" hint="Активный сервисный цикл" tone="warning" />
        <KPIChipCard label="Готово к аренде" value={kpi.readyForRent || 0} icon="sales" hint="Можно выводить в rental" tone="positive" />
        <KPIChipCard label="Готово к продаже" value={kpi.readyForSale || 0} icon="sales" hint="Доступно для sales" tone="positive" />
        <KPIChipCard label="У клиента" value={kpi.issuedToClient || 0} icon="clients" hint="Выдано клиентам" tone="info" />
        <KPIChipCard label="На подмене / в аренде" value={kpi.onReplacementOrRent || 0} icon="dashboard" hint="Активно в полях" tone="warning" />
      </div>

      <article className="equipment-hub-alerts">
        <header>
          <div>
            <small>Equipment pulse</small>
            <h3>Предупреждения</h3>
          </div>
          <small>{alertRows.reduce((sum, row) => sum + (row.count || 0), 0)} проблем в парке</small>
        </header>
        <div className="equipment-hub-alerts__grid">
          {Object.keys(ALERT_LABELS).map((key) => {
            const row = alertRows.find((item) => item.key === key) || { count: 0 };
            const isActive = activeWarning === key;
            return (
              <button
                key={key}
                type="button"
                className={`equipment-hub-alert equipment-hub-alert--${ALERT_TONES[key] || 'warning'} ${isActive ? 'active' : ''}`}
                onClick={() => onAlertClick?.(key)}
              >
                <span>{ALERT_LABELS[key]}</span>
                <strong>{row.count || 0}</strong>
              </button>
            );
          })}
        </div>
      </article>
    </div>
  );
}

function EquipmentListCard({
  item,
  active,
  viewMode = 'grid',
  onClick,
  onOpenServiceCase,
  onOpenPhotos,
  onOpenCard,
  onOptionalAction,
}) {
  const hasActiveCase = Boolean(item.activeServiceCaseId);
  const warnings = item.warnings || [];
  const previewUrl = getEquipmentCardCover(item.id) || item.previewUrl || item.photoUrl || item.imageUrl || item.mediaPreviewUrl || '';
  const quickActionLabel = hasActiveCase ? 'Кейс' : 'Открыть';
  const modelTitle = `${item.brand || 'Без бренда'} ${item.model || ''}`.trim();
  const ownerMeta = item.clientName || (item.ownerType === 'company' ? 'Техника компании' : 'Клиент не указан');
  const assignedMaster = item.assignedToUser?.fullName || item.assignedMaster || item.assignedToUserId || '—';
  const shortWarnings = warnings.slice(0, 2);
  const handleCardKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick?.();
    }
  };

  return (
    <article
      className={`equipment-ops-card equipment-ops-card--rich equipment-ops-card--${viewMode} ${active ? 'active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleCardKeyDown}
    >
      <div className="equipment-ops-card__preview">
        {previewUrl ? (
          <img src={previewUrl} alt={modelTitle} loading="lazy" />
        ) : (
          <div className="equipment-ops-card__preview-placeholder">
            <Icon name="equipment" />
            <span>Нет фото</span>
          </div>
        )}
        <div className="equipment-ops-card__top">
          <StatusBadge status={item.commercialStatus || 'none'}>{COMMERCIAL_LABELS[item.commercialStatus || 'none'] || (item.commercialStatus || 'none')}</StatusBadge>
          <span className="equipment-ops-card__type-chip">{item.equipmentType || item.type || 'оборудование'}</span>
        </div>
      </div>

      <p className="equipment-ops-card__title">{modelTitle}</p>
      <div className="equipment-ops-card__meta">
        <span><Icon name="equipment" /> {item.internalNumber || '—'} / {item.serial || '—'}</span>
        <span><Icon name="clients" /> {ownerMeta}</span>
        <span><Icon name="employees" /> Мастер: {assignedMaster}</span>
        <span><Icon name="dashboard" /> Обновлено: {formatDate(item.updatedAt)}</span>
      </div>

      <div className="equipment-ops-card__scan-chips">
        <em>{item.serviceStatus || '—'}</em>
        {hasActiveCase ? <em>кейс: {item.activeServiceCaseId}</em> : <em>без активного кейса</em>}
      </div>

      {shortWarnings.length ? (
        <div className="warning-badges">
          {shortWarnings.map((warning) => <span key={warning}>{ALERT_LABELS[warning] || warning}</span>)}
          {warnings.length > shortWarnings.length ? <span>+{warnings.length - shortWarnings.length}</span> : null}
        </div>
      ) : null}

      <ActionRail compact className="equipment-ops-card__actions" onClick={(event) => event.stopPropagation()}>
        <ActionRailButton onClick={() => onOpenCard?.()}>Открыть</ActionRailButton>
        <ActionRailButton tone="brand" onClick={() => onOpenServiceCase()}>{quickActionLabel}</ActionRailButton>
        <ActionRailButton onClick={() => onOpenPhotos?.()}>Фото</ActionRailButton>
        {onOptionalAction ? <ActionRailButton onClick={() => onOptionalAction?.()}>Продажи</ActionRailButton> : null}
      </ActionRail>
    </article>
  );
}

function passesQuickFilter(item, quickFilter) {
  const serviceStatus = String(item.serviceStatus || item.activeServiceCaseStatus || '').trim();
  const commercialStatus = String(item.commercialStatus || '').trim();
  const warnings = item.warnings || [];

  if (quickFilter === 'in_service') return ['accepted', 'in_progress', 'testing', 'ready'].includes(serviceStatus);
  if (quickFilter === 'ready') return serviceStatus === 'ready';
  if (quickFilter === 'rent') return RENT_STATUSES.has(commercialStatus);
  if (quickFilter === 'sale') return SALE_STATUSES.has(commercialStatus);
  if (quickFilter === 'client') return commercialStatus === 'issued_to_client';
  if (quickFilter === 'attention') return warnings.length > 0;
  return true;
}

function matchesSearch(item, value) {
  if (!value) return true;
  const haystack = [
    item.id,
    item.brand,
    item.model,
    item.internalNumber,
    item.serial,
    item.clientName,
    item.assignedToUser?.fullName,
    item.equipmentType,
  ].join(' ').toLowerCase();
  return haystack.includes(value.toLowerCase());
}

function EquipmentListToolbar({ quickFilter, onFilterChange, viewMode, onViewModeChange, searchTerm, onSearchTermChange }) {
  return (
    <div className="equipment-list-toolbar">
      <div className="equipment-list-toolbar__row">
        <ActionRail compact className="equipment-list-toolbar__chips">
          {EQUIPMENT_LIST_FILTERS.map((filter) => (
            <ActionRailButton
              key={filter.key}
              active={quickFilter === filter.key}
              tone={quickFilter === filter.key ? 'brand' : 'default'}
              onClick={() => onFilterChange(filter.key)}
            >
              {filter.label}
            </ActionRailButton>
          ))}
        </ActionRail>
        <ActionRail compact className="equipment-list-toolbar__toggle" role="group" aria-label="Вид списка">
          <ActionRailButton active={viewMode === 'grid'} tone={viewMode === 'grid' ? 'brand' : 'default'} onClick={() => onViewModeChange('grid')}>Сетка</ActionRailButton>
          <ActionRailButton active={viewMode === 'list'} tone={viewMode === 'list' ? 'brand' : 'default'} onClick={() => onViewModeChange('list')}>Список</ActionRailButton>
        </ActionRail>
      </div>
      <input
        type="search"
        value={searchTerm}
        onChange={(event) => onSearchTermChange(event.target.value)}
        placeholder="Поиск: бренд, модель, серийный номер, клиент…"
      />
    </div>
  );
}

function MediaGallery({ rows = [], onOpen, equipmentId, onCoverSelect, onDelete }) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [caseFilter, setCaseFilter] = useState('all');
  const storedCover = getEquipmentCardCover(equipmentId);
  const autoCover = useMemo(() => {
    const firstPhoto = rows.find((item) => item.mediaType === 'photo' && hasRenderableMedia(item));
    return firstPhoto ? String(firstPhoto.previewUrl || firstPhoto.fullUrl || firstPhoto.fileUrl || '') : '';
  }, [rows]);
  const selectedCover = storedCover || autoCover;

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

  if (!rows.length) return <p className="empty-copy">Нет медиа по этому оборудованию.</p>;

  return (
    <div className="equipment-detail-section equipment-gallery-shell">
      <div className="equipment-media-filters equipment-media-filters--compact">
        <div className="quick-filter-row quick-filter-row--compact">
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

        <div className="quick-filter-row quick-filter-row--compact quick-filter-row--scrollable">
          <button type="button" className={caseFilter === 'all' ? 'active' : ''} onClick={() => setCaseFilter('all')}>Все кейсы</button>
          <button type="button" className={caseFilter === 'no_case' ? 'active' : ''} onClick={() => setCaseFilter('no_case')}>Без кейса</button>
          {caseOptions.map((serviceCaseId) => (
            <button key={serviceCaseId} type="button" className={caseFilter === serviceCaseId ? 'active' : ''} onClick={() => setCaseFilter(serviceCaseId)}>
              Кейс {serviceCaseId}
            </button>
          ))}
        </div>
      </div>

      <div className="equipment-gallery-grid">
        {filtered.map((media, index) => {
          const originalIndex = rows.findIndex((item) => item.id === media.id);
          const isRenderable = hasRenderableMedia(media);
          const mediaUrl = media.previewUrl || media.fullUrl || media.fileUrl || '';
          const isCover = selectedCover && selectedCover === mediaUrl;

          return (
            <article key={media.id || `${media.fullUrl || media.fileUrl}-${index}`} className={`equipment-gallery-card ${!isRenderable ? 'is-broken' : ''}`}>
              <div className="equipment-gallery-card__media">
                {isRenderable ? (
                  <button type="button" className="equipment-gallery-card__open" onClick={() => onOpen(originalIndex)}>
                    {media.mediaType === 'video'
                      ? <video src={mediaUrl} muted playsInline preload="metadata" />
                      : <img src={mediaUrl} alt={media.caption || media.originalName || 'media'} loading="lazy" />}
                  </button>
                ) : (
                  <div className="equipment-gallery-card__broken">
                    <Icon name="content" />
                    <span>Файл недоступен</span>
                  </div>
                )}

                <div className="equipment-gallery-card__actions">
                  {isRenderable ? (
                    <button type="button" className="equipment-gallery-card__action" onClick={() => onOpen(originalIndex)}>
                      Открыть
                    </button>
                  ) : null}
                  {media.mediaType === 'photo' && isRenderable ? (
                    <button
                      type="button"
                      className={`equipment-gallery-card__action ${isCover ? 'active' : ''}`}
                      onClick={() => {
                        setEquipmentCardCover(equipmentId, media);
                        onCoverSelect?.();
                      }}
                    >
                      {isCover ? 'На карточке' : 'На карточку'}
                    </button>
                  ) : null}
                  {onDelete ? (
                    <button type="button" className="equipment-gallery-card__action danger" onClick={() => onDelete(media)}>
                      Удалить
                    </button>
                  ) : null}
                </div>
                <div className="equipment-gallery-card__footer">
                  <strong>{getMediaDisplayTitle(media, 'Битый файл')}</strong>
                  <span>{formatDate(media.createdAt)}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {!filtered.length ? <p className="empty-copy media-empty">По выбранному фильтру файлов нет.</p> : null}
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

function ActionPanel({
  detail,
  onQuickMediaUploaded,
  navigateToBoard,
  basePath,
  canUploadCaseMedia = false,
  canCommercialOperate = false,
}) {
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

      <ActionRail>
        <ActionRailButton tone="brand" disabled={!activeCase?.id} onClick={() => activeCase?.id && navigateToBoard('service_case', activeCase.id)}>
          Открыть активный кейс
        </ActionRailButton>
        <ActionRailButton onClick={() => navigateToBoard('service_flow', detail?.equipment?.id)}>Сервисный поток</ActionRailButton>
        <ActionRailButton onClick={() => navigateToBoard('service_board', detail?.equipment?.id)}>Сервисная доска</ActionRailButton>
        <ActionRailButton onClick={() => navigateToBoard('director_board', detail?.equipment?.id)}>Директор</ActionRailButton>
        <ActionRailButton onClick={() => navigateToBoard('sales_board', detail?.equipment?.id)}>Продажи</ActionRailButton>
      </ActionRail>

      {canUploadCaseMedia ? (
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
      ) : null}

      {canCommercialOperate ? (
        <div className="equipment-action-panel__commercial">
          <h5>Быстрые коммерческие действия</h5>
          <ActionRail>
            {commercialActions.map((action) => (
              <ActionRailButton
                disabled={Boolean(actionLoading)}
                key={action.key + action.targetStatus}
                tone={action.key.startsWith('reserve') ? 'brand' : 'default'}
                onClick={() => applyCommercialAction(action)}
              >
                {actionLoading === `commercial:${action.key}:${action.targetStatus || ''}` ? 'Сохраняем...' : action.label}
              </ActionRailButton>
            ))}
            {!commercialActions.length ? <span className="empty-copy">Нет доступных действий.</span> : null}
          </ActionRail>
        </div>
      ) : null}

      <p className="equipment-action-panel__links">
        Быстрые ссылки: <a href={`${basePath}/service`}>Сервисная доска</a> · <a href={`${basePath}/director`}>Доска директора</a> · <a href={`${basePath}/sales`}>Доска продаж</a>
      </p>
      {feedback ? <p>{feedback}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </section>
  );
}

function TabPanel({
  tab,
  detail,
  onOpenMedia,
  onRefreshDetail,
  navigateToBoard,
  basePath,
  canCreateEquipment = false,
  canEditEquipment = false,
  canUploadEquipmentMedia = false,
  canDeleteEquipmentMedia = false,
  canCommercialOperate = false,
  canUploadCaseMedia = false,
}) {
  const [commentBody, setCommentBody] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [editForm, setEditForm] = useState({ brand: '', model: '', serial: '', internalNumber: '' });
  const [busy, setBusy] = useState('');
  if (!detail) return <p className="empty-copy">Выберите единицу оборудования.</p>;
  if (tab === 'overview') {
    const equipment = detail.equipment || {};
    const activeCase = detail.serviceCases?.find((item) => item.isActive) || null;
    const latestMedia = (detail.media || [])[0] || null;
    const warnings = getEquipmentWarnings(detail);
    return (
      <section className="equipment-detail-section">
        {canCreateEquipment ? (
          <ActionRail compact>
            <ActionRailButton tone="brand" onClick={() => navigateToBoard('equipment_create')}>Добавить оборудование</ActionRailButton>
            <ActionRailButton onClick={() => navigateToBoard('equipment_intake')}>Принять в intake</ActionRailButton>
          </ActionRail>
        ) : null}
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

        {activeCase ? (
          <article className="equipment-active-case-highlight">
            <header>
              <h4>Активный сервисный кейс</h4>
              <StatusBadge status={activeCase.serviceStatus || 'none'}>{activeCase.serviceStatus || '—'}</StatusBadge>
            </header>
            <p><strong>{activeCase.id}</strong> · назначен: {activeCase.assignedToUser?.fullName || activeCase.assignedToUserId || 'не назначен'}.</p>
            <p>Обновлён: {formatDate(activeCase.updatedAt)}.</p>
            <button type="button" onClick={() => navigateToBoard('service_case', activeCase.id)}>Открыть кейс</button>
          </article>
        ) : null}

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

        {canEditEquipment ? (
          <article className="detail-section-card">
            <h4>Редактирование Equipment card</h4>
            <div className="equipment-detail-grid">
              <input placeholder={equipment.brand || 'Бренд'} value={editForm.brand} onChange={(e) => setEditForm((p) => ({ ...p, brand: e.target.value }))} />
              <input placeholder={equipment.model || 'Модель'} value={editForm.model} onChange={(e) => setEditForm((p) => ({ ...p, model: e.target.value }))} />
              <input placeholder={equipment.serial || 'Серийный'} value={editForm.serial} onChange={(e) => setEditForm((p) => ({ ...p, serial: e.target.value }))} />
              <input placeholder={equipment.internalNumber || 'Инв. №'} value={editForm.internalNumber} onChange={(e) => setEditForm((p) => ({ ...p, internalNumber: e.target.value }))} />
            </div>
            <ActionRail compact>
              <ActionRailButton
                tone="brand"
                disabled={Boolean(busy)}
                onClick={async () => {
                  setBusy('edit');
                  try {
                    await adminServiceApi.updateEquipment(equipment.id, editForm);
                    setEditForm({ brand: '', model: '', serial: '', internalNumber: '' });
                    await onRefreshDetail?.();
                  } finally { setBusy(''); }
                }}
              >
                {busy === 'edit' ? 'Сохраняем...' : 'Сохранить карточку'}
              </ActionRailButton>
            </ActionRail>
          </article>
        ) : null}

        <ActionPanel
          detail={detail}
          onQuickMediaUploaded={onRefreshDetail}
          navigateToBoard={navigateToBoard}
          basePath={basePath}
          canUploadCaseMedia={canUploadCaseMedia}
          canCommercialOperate={canCommercialOperate}
        />
      </section>
    );
  }
  if (tab === 'media') {
    const activeCase = detail.serviceCases?.find((item) => item.isActive) || null;
    return (
      <section className="equipment-detail-section">
        <article className="detail-section-card">
          <h4>Загрузка медиа</h4>
          <p>Можно сохранить в паспорт техники или в активный сервисный кейс.</p>
        </article>
        {canUploadEquipmentMedia ? (
          <div className="detail-composer detail-composer--stack">
            <input type="file" multiple accept="image/*,video/*" />
            <ActionRail compact>
              <ActionRailButton
                tone="brand"
                onClick={async () => {
                  const fileInput = document.querySelector('.equipment-detail-section input[type=\"file\"]');
                  const files = Array.from(fileInput?.files || []);
                  if (!files.length) return;
                  const toCase = activeCase?.id && window.confirm(`Активный кейс найден (${activeCase.id}). Загрузить в кейс? Нажмите "Отмена", чтобы сохранить в паспорт оборудования.`);
                  await adminServiceApi.uploadEquipmentMedia(detail.equipment.id, files, { serviceCaseId: toCase ? activeCase.id : null });
                  if (fileInput) fileInput.value = '';
                  await onRefreshDetail?.();
                }}
              >Загрузить</ActionRailButton>
            </ActionRail>
          </div>
        ) : null}
        <MediaGallery
          rows={detail.media || []}
          onOpen={onOpenMedia}
          equipmentId={detail.equipment?.id}
          onCoverSelect={onRefreshDetail}
          onDelete={canDeleteEquipmentMedia ? ((media) => adminServiceApi.deleteMedia(media.id).then(() => onRefreshDetail?.())) : null}
        />
      </section>
    );
  }
  if (tab === 'history') return <TimelineView rows={detail.timeline || []} />;
  if (tab === 'service_cases') {
    const rows = detail.serviceCases || [];
    if (!rows.length) return <p className="empty-copy">Кейсов не найдено.</p>;
    const activeCase = rows.find((row) => row.isActive) || null;
    const pastCases = rows.filter((row) => !row.isActive);
    return (
      <div className="equipment-cases-list">
        <section className="detail-section-card equipment-case-focus">
          <h4>Активный кейс</h4>
          {activeCase ? (
            <article className="equipment-case-card equipment-case-card--active">
              <header>
                <strong>{activeCase.id}</strong>
                <span className="signal-chip signal-chip--critical">активный</span>
              </header>
              <p>Статус: {activeCase.serviceStatus || '—'}</p>
              <p>Назначен: {activeCase.assignedToUser?.fullName || activeCase.assignedToUserId || '—'}</p>
              <p>Создан: {formatDate(activeCase.createdAt)} · Обновлён: {formatDate(activeCase.updatedAt)}</p>
              <a href={`${basePath}/service?caseId=${encodeURIComponent(activeCase.id)}`}>Открыть детальный просмотр кейса: {activeCase.id}</a>
            </article>
          ) : <p className="empty-copy">Активный кейс отсутствует.</p>}
        </section>

        <section className="detail-section-card equipment-case-history-block">
          <h4>Прошлые сервисные кейсы ({pastCases.length})</h4>
          {!pastCases.length ? <p className="empty-copy">Истории прошлых кейсов нет.</p> : null}
          {pastCases.map((row) => (
            <article key={row.id} className="equipment-case-card">
              <header>
                <strong>{row.id}</strong>
                <StatusBadge status={row.serviceStatus || 'none'}>{row.serviceStatus || '—'}</StatusBadge>
              </header>
              <p>Назначен: {row.assignedToUser?.fullName || row.assignedToUserId || '—'}</p>
              <p>Создан: {formatDate(row.createdAt)} · Обновлён: {formatDate(row.updatedAt)}</p>
              <a href={`${basePath}/service?caseId=${encodeURIComponent(row.id)}`}>Открыть кейс {row.id}</a>
            </article>
          ))}
        </section>
      </div>
    );
  }
  if (tab === 'notes') {
    const rows = [...(detail.equipmentNotes || []), ...(detail.notes || [])];
    if (!rows.length) return <p className="empty-copy">Заметок пока нет.</p>;
    return (
      <section className="equipment-detail-section">
        <div className="detail-composer">
          <input value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Новая заметка по оборудованию" />
          <ActionRail compact>
            <ActionRailButton
              tone="brand"
              disabled={!noteBody.trim() || Boolean(busy)}
              onClick={async () => {
                setBusy('note');
                try {
                  await adminServiceApi.addEquipmentNote(detail.equipment.id, noteBody.trim());
                  setNoteBody('');
                  await onRefreshDetail?.();
                } finally { setBusy(''); }
              }}
            >{busy === 'note' ? 'Сохраняем...' : 'Добавить заметку'}</ActionRailButton>
          </ActionRail>
        </div>
        <ul className="equipment-notes-list detail-list">
          {rows.map((row) => (
            <li key={row.id} className="detail-list__item">
              <p>{row.body}</p>
              <small>{row.authorUser?.fullName || '—'} · {formatDate(row.createdAt)} · кейс {row.serviceCaseId || '—'}</small>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (tab === 'comments') {
    const rows = detail.comments || [];
    return (
      <section className="equipment-detail-section">
        <div className="detail-composer">
          <input value={commentBody} onChange={(e) => setCommentBody(e.target.value)} placeholder="Комментарий по карточке" />
          <ActionRail compact>
            <ActionRailButton
              tone="brand"
              disabled={!commentBody.trim() || Boolean(busy)}
              onClick={async () => {
                setBusy('comment');
                try {
                  await adminServiceApi.addEquipmentComment(detail.equipment.id, commentBody.trim());
                  setCommentBody('');
                  await onRefreshDetail?.();
                } finally { setBusy(''); }
              }}
            >{busy === 'comment' ? 'Сохраняем...' : 'Добавить комментарий'}</ActionRailButton>
          </ActionRail>
        </div>
        {!rows.length ? <p className="empty-copy">Комментариев пока нет.</p> : (
          <ul className="equipment-notes-list detail-list">
            {rows.map((row) => <li key={row.id} className="detail-list__item"><p>{row.body}</p><small>{row.authorUser?.fullName || '—'} · {formatDate(row.createdAt)}</small></li>)}
          </ul>
        )}
      </section>
    );
  }

  if (tab === 'tasks') {
    const rows = detail.tasks || [];
    return (
      <section className="equipment-detail-section">
        <div className="detail-composer detail-composer--stack">
          <div className="equipment-detail-grid">
            <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="Название задачи" />
            <input value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder="Описание" />
          </div>
          <ActionRail compact>
            <ActionRailButton
              tone="brand"
              disabled={!taskTitle.trim() || Boolean(busy)}
              onClick={async () => {
                setBusy('task');
                try {
                  await adminServiceApi.createEquipmentTask(detail.equipment.id, { title: taskTitle.trim(), description: taskDescription.trim() || null });
                  setTaskTitle('');
                  setTaskDescription('');
                  await onRefreshDetail?.();
                } finally { setBusy(''); }
              }}
            >{busy === 'task' ? 'Создаём...' : 'Создать задачу'}</ActionRailButton>
          </ActionRail>
        </div>
        {!rows.length ? <p className="empty-copy">Задач пока нет.</p> : (
          <ul className="equipment-notes-list detail-list">
            {rows.map((row) => (
              <li key={row.id} className="detail-list__item">
                <p><strong>{row.title}</strong> — {row.description || 'без описания'}</p>
                <small>{row.status} · {row.assignedToUser?.fullName || 'не назначено'} · до {formatDate(row.dueAt)}</small>
                <ActionRail compact>
                  {['todo', 'in_progress', 'done'].map((status) => (
                    <ActionRailButton key={status} active={row.status === status} tone={row.status === status ? 'brand' : 'default'} onClick={() => adminServiceApi.updateTaskStatus(row.id, status).then(() => onRefreshDetail?.())}>{status}</ActionRailButton>
                  ))}
                </ActionRail>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  if (tab === 'documents') {
    return (
      <section className="equipment-detail-section">
        <p>Документы оборудования: PDF-паспорт, акты и файлы приёмки.</p>
        <p>Ссылка на паспорт: {detail.equipment?.passportPdfUrl || '—'}</p>
      </section>
    );
  }

  const actions = detail.currentActions?.all || [];
  return (
    <section className="equipment-detail-section">
      <p>Текущий коммерческий статус: {COMMERCIAL_LABELS[detail.equipment?.commercialStatus || 'none'] || (detail.equipment?.commercialStatus || 'none')}</p>
      <ActionRail>
        {actions.map((action) => <ActionRailButton key={action.key + action.targetStatus}>{action.label}</ActionRailButton>)}
        {!actions.length ? <span className="empty-copy">Нет доступных действий.</span> : null}
      </ActionRail>
    </section>
  );
}

export function AdminEquipmentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { equipmentId } = useParams();

  const [dashboard, setDashboard] = useState({ kpi: {}, alerts: [] });
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [quickFilter, setQuickFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.matchMedia('(max-width: 980px)').matches : false));
  const canCreateEquipment = [ROLES.manager, ROLES.serviceHead, ROLES.owner, ROLES.director].includes(user?.role);
  const canEditEquipment = [ROLES.manager, ROLES.serviceHead, ROLES.owner, ROLES.director].includes(user?.role);
  const canUploadEquipmentMedia = [ROLES.manager, ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director].includes(user?.role);
  const canDeleteEquipmentMedia = [ROLES.manager, ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director].includes(user?.role);
  const canCommercialOperate = [ROLES.manager, ROLES.salesManager, ROLES.owner, ROLES.director].includes(user?.role);
  const canUploadCaseMedia = [ROLES.manager, ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director].includes(user?.role);

  const basePath = getBaseAdminPath(location.pathname);
  const warningFilter = String(searchParams.get('warning') || '').trim();

  useEffect(() => {
    const query = typeof window !== 'undefined' ? window.matchMedia('(max-width: 980px)') : null;
    if (!query) return undefined;
    const listener = (event) => setIsMobile(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  async function loadDashboard() {
    const payload = await adminServiceApi.equipmentDashboard();
    setDashboard(payload || { kpi: {}, alerts: [] });
  }

  async function loadList() {
    const payload = await adminServiceApi.equipmentList({
      warning: warningFilter || undefined,
    });
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

  useEffect(() => {
    loadDashboard().catch(() => setDashboard({ kpi: {}, alerts: [] }));
    loadList().catch(() => setItems([]));
  }, [searchParams, equipmentId, isMobile]); // eslint-disable-line

  useEffect(() => {
    const targetId = equipmentId || selectedId;
    loadDetail(targetId).catch(() => setDetail(null));
  }, [equipmentId, selectedId]);

  const mediaRows = useMemo(() => (detail?.media || []).slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [detail]);
  const filteredItems = useMemo(
    () => items
      .filter((item) => passesQuickFilter(item, quickFilter))
      .filter((item) => matchesSearch(item, searchTerm)),
    [items, quickFilter, searchTerm],
  );

  function selectEquipment(id) {
    if (isMobile) {
      navigate(`${basePath}/equipment/${id}`);
      return;
    }
    setSelectedId(id);
  }

  function closeMobileDetail() {
    navigate(`${basePath}/equipment${warningFilter ? `?warning=${encodeURIComponent(warningFilter)}` : ''}`);
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
      return;
    }
    if (target === 'equipment_intake') {
      navigate(`${basePath}/equipment/intake`);
      return;
    }
    if (target === 'equipment_create') {
      navigate(`${basePath}/equipment/intake?mode=create`);
    }
  }

  function onAlertClick(warningKey) {
    const next = new URLSearchParams(searchParams);
    if (warningFilter === warningKey) next.delete('warning');
    else next.set('warning', warningKey);
    const query = next.toString();
    navigate(`${basePath}/equipment${query ? `?${query}` : ''}`);
  }

  function resetWarningFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete('warning');
    const query = next.toString();
    navigate(`${basePath}/equipment${query ? `?${query}` : ''}`);
  }

  const mobileDetailMode = isMobile && Boolean(equipmentId);

  return (
    <section className="equipment-ops-page">
      <header className="equipment-command">
        <div>
          <small>Equipment registry</small>
          <h2>Центр оборудования</h2>
          <p>Центр управления парком техники: KPI, предупреждения, быстрые действия и операционный паспорт.</p>
        </div>
      </header>

      <DashboardHeader dashboard={dashboard} onAlertClick={onAlertClick} activeWarning={warningFilter} />

      <div className={`equipment-ops-layout ${mobileDetailMode ? 'mobile-detail' : ''}`}>
        {!mobileDetailMode ? (
          <aside className="equipment-ops-list">
            <EquipmentListToolbar
              quickFilter={quickFilter}
              onFilterChange={setQuickFilter}
              viewMode={isMobile ? 'list' : viewMode}
              onViewModeChange={setViewMode}
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
            />
            {warningFilter ? (
              <div className="equipment-warning-filter-chip">
                <span>Фильтр: {ALERT_LABELS[warningFilter] || warningFilter}</span>
                <button type="button" onClick={resetWarningFilter}>Сбросить</button>
              </div>
            ) : null}
            <div className={`equipment-ops-list__cards equipment-ops-list__cards--${isMobile ? 'list' : viewMode}`}>
              {filteredItems.map((item) => (
                <EquipmentListCard
                  key={item.id}
                  item={item}
                  viewMode={isMobile ? 'list' : viewMode}
                  active={(equipmentId || selectedId) === item.id}
                  onClick={() => selectEquipment(item.id)}
                  onOpenCard={() => selectEquipment(item.id)}
                  onOpenPhotos={() => { setActiveTab('media'); selectEquipment(item.id); }}
                  onOpenServiceCase={() => navigateToBoard(item.activeServiceCaseId ? 'service_case' : 'service_board', item.activeServiceCaseId || item.id)}
                  onOptionalAction={() => navigateToBoard('sales_board', item.id)}
                />
              ))}
            </div>
            {!filteredItems.length ? <p className="empty-copy">Нет оборудования по выбранному фильтру.</p> : null}
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
            canCreateEquipment={canCreateEquipment}
            canEditEquipment={canEditEquipment}
            canUploadEquipmentMedia={canUploadEquipmentMedia}
            canDeleteEquipmentMedia={canDeleteEquipmentMedia}
            canCommercialOperate={canCommercialOperate}
            canUploadCaseMedia={canUploadCaseMedia}
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
