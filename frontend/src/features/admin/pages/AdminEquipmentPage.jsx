import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { adminServiceApi } from '../api/adminServiceApi';
import { useAdminI18n } from '../adminI18n';
import { ActionRail, ActionRailButton, Icon, StatusBadge } from '../components/AdminUi';
import { ROLES } from '../roleConfig';
import { getEquipmentCardCover, setEquipmentCardCover } from '../utils/equipmentCardCover';

const TABS = [
  { key: 'overview', labelKey: 'overview' },
  { key: 'media', labelKey: 'photos_video' },
  { key: 'history', labelKey: 'history' },
  { key: 'service_cases', labelKey: 'service_cases' },
  { key: 'tasks', labelKey: 'tasks' },
  { key: 'comments', labelKey: 'comments' },
  { key: 'notes', labelKey: 'notes' },
  { key: 'commercial', labelKey: 'commerce' },
  { key: 'documents', labelKey: 'documents' },
];

const COMMERCIAL_LABEL_KEYS = {
  none: 'none',
  ready_for_issue: 'ready_for_issue',
  issued_to_client: 'issued_to_client',
  ready_for_rent: 'ready_for_rent',
  reserved_for_rent: 'reserved_for_rent',
  out_on_rent: 'out_on_rent',
  out_on_replacement: 'out_on_replacement',
  ready_for_sale: 'ready_for_sale',
  reserved_for_sale: 'reserved_for_sale',
  sold: 'sold',
};

const EVENT_META = {
  service_status_changed: { labelKey: 'service_status_changed', tone: 'service', icon: 'service' },
  commercial_status_changed: { labelKey: 'commercial_status_changed', tone: 'commercial', icon: 'sales' },
  assignment: { labelKey: 'assignment', tone: 'assignment', icon: 'employees' },
  processed: { labelKey: 'processed', tone: 'processed', icon: 'dashboard' },
  media_uploaded: { labelKey: 'media_uploaded', tone: 'media', icon: 'content' },
  note_added: { labelKey: 'note_added', tone: 'note', icon: 'content' },
  legacy_event: { labelKey: 'legacy_event', tone: 'legacy', icon: 'bell' },
};

const ALERT_LABEL_KEYS = {
  missing_serial_for_client: 'missing_serial_for_client',
  missing_internal_for_company: 'missing_internal_for_company',
  missing_media: 'missing_media',
  missing_active_service_case: 'missing_active_service_case',
  stale_ready: 'stale_ready_alert',
  inconsistent_status_data: 'inconsistent_status_data',
};

const ALERT_TONES = {
  missing_serial_for_client: 'warning',
  missing_internal_for_company: 'warning',
  missing_media: 'warning',
  missing_active_service_case: 'warning',
  stale_ready: 'critical',
  inconsistent_status_data: 'critical',
};

const RENT_STATUSES = new Set(['ready_for_rent', 'reserved_for_rent', 'out_on_rent', 'out_on_replacement']);
const SALE_STATUSES = new Set(['ready_for_sale', 'reserved_for_sale', 'sold']);
const EQUIPMENT_BOARD_COLUMNS = [
  { key: 'service', labelKey: 'service_column', eyebrowKey: 'in_work_short', accent: 'blue' },
  { key: 'ready', labelKey: 'ready_column', eyebrowKey: 'can_release', accent: 'green' },
  { key: 'rent', labelKey: 'rent_column', eyebrowKey: 'rental_flow', accent: 'yellow' },
  { key: 'sale', labelKey: 'sale_column', eyebrowKey: 'sales_flow', accent: 'rose' },
  { key: 'client', labelKey: 'client_column', eyebrowKey: 'field_work', accent: 'violet' },
  { key: 'attention', labelKey: 'attention_column', eyebrowKey: 'check_required', accent: 'orange' },
];

function formatDate(value, locale = 'ru') {
  return value ? new Date(value).toLocaleString(locale === 'uk' ? 'uk-UA' : 'ru-RU') : '—';
}

function formatDay(value, locale = 'ru', fallback = '—') {
  return value ? new Date(value).toLocaleDateString(locale === 'uk' ? 'uk-UA' : 'ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : fallback;
}

function isUrlLike(value = '') {
  return /^https?:\/\//i.test(String(value).trim());
}

function getMediaDisplayTitle(media, fallback = 'Медиафайл', t = (value) => value) {
  if (media?.caption?.trim() && !isUrlLike(media.caption)) return media.caption.trim();
  if (media?.originalName?.trim() && !isUrlLike(media.originalName)) return media.originalName.trim();
  return media?.mediaType === 'video' ? t('video') : (media?.mediaType === 'photo' ? t('photo') : fallback);
}

function hasRenderableMedia(media) {
  const preview = String(media?.previewUrl || media?.fullUrl || media?.fileUrl || '').trim();
  return Boolean(preview);
}

function getBaseAdminPath(pathname = '') {
  return pathname.startsWith('/tg/admin') ? '/tg/admin' : '/admin';
}

function getEquipmentWarnings(detail, t = (value) => value) {
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
  return warnings.map((key) => t(ALERT_LABEL_KEYS[key] || key));
}

function getCommercialLabel(status, t = (value) => value) {
  return t(COMMERCIAL_LABEL_KEYS[status] || status || 'none');
}

function DashboardSummaryColumn({ dashboard, onAlertClick, activeWarning, onResetWarning, t }) {
  const kpi = dashboard?.kpi || {};
  const alertRows = dashboard?.alerts || [];
  const kpiRows = [
    { key: 'total', label: t('total_equipment'), value: kpi.totalEquipment || 0, hint: t('fleet_registry') },
    { key: 'service', label: t('in_service'), value: kpi.inService || 0, hint: t('active_cycle') },
    { key: 'rent', label: t('ready_rent'), value: kpi.readyForRent || 0, hint: t('rental_flow') },
    { key: 'sale', label: t('ready_sale'), value: kpi.readyForSale || 0, hint: t('sales_flow') },
    { key: 'client', label: t('with_client'), value: kpi.issuedToClient || 0, hint: t('client_points') },
    { key: 'field', label: t('replacement_rent'), value: kpi.onReplacementOrRent || 0, hint: t('in_field') },
  ];

  return (
    <section className="equipment-board-column equipment-board-column--summary" data-accent="gold">
      <header className="equipment-board-column__header equipment-board-column__header--summary">
        <div>
          <small>{t('equipment_pulse')}</small>
          <h4>{t('summary')}</h4>
        </div>
        <strong>{kpi.totalEquipment || 0}</strong>
      </header>

      {activeWarning ? (
        <div className="equipment-warning-filter-chip equipment-warning-filter-chip--summary">
          <span>{t('filter')}: {t(ALERT_LABEL_KEYS[activeWarning] || activeWarning)}</span>
          <button type="button" onClick={onResetWarning}>{t('reset')}</button>
        </div>
      ) : null}

      <div className="equipment-board-summary-grid">
        {kpiRows.map((row) => (
          <article key={row.key} className="equipment-board-summary-card">
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            <small>{row.hint}</small>
          </article>
        ))}
      </div>

      <article className="equipment-hub-alerts equipment-hub-alerts--column">
        <header>
          <div>
            <small>{t('monitoring')}</small>
            <h3>{t('warnings')}</h3>
          </div>
          <small>{alertRows.reduce((sum, row) => sum + (row.count || 0), 0)} {t('signals')}</small>
        </header>
        <div className="equipment-hub-alerts__grid equipment-hub-alerts__grid--column">
          {Object.keys(ALERT_LABEL_KEYS).map((key) => {
            const row = alertRows.find((item) => item.key === key) || { count: 0 };
            const isActive = activeWarning === key;
            return (
              <button
                key={key}
                type="button"
                className={`equipment-hub-alert equipment-hub-alert--${ALERT_TONES[key] || 'warning'} ${isActive ? 'active' : ''}`}
                onClick={() => onAlertClick?.(key)}
              >
                <span>{t(ALERT_LABEL_KEYS[key] || key)}</span>
                <strong>{row.count || 0}</strong>
              </button>
            );
          })}
        </div>
      </article>
    </section>
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
  t,
  locale,
}) {
  const hasActiveCase = Boolean(item.activeServiceCaseId);
  const warnings = item.warnings || [];
  const previewUrl = getEquipmentCardCover(item.id) || item.previewUrl || item.photoUrl || item.imageUrl || item.mediaPreviewUrl || '';
  const quickActionLabel = hasActiveCase ? t('request_card_title') : t('open');
  const modelTitle = `${item.brand || t('no_brand')} ${item.model || ''}`.trim();
  const ownerMeta = item.clientName || (item.ownerType === 'company' ? t('company_equipment') : t('client_not_set'));
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
            <span>{t('no_photo')}</span>
          </div>
        )}
        <div className="equipment-ops-card__top">
          <StatusBadge status={item.commercialStatus || 'none'}>{getCommercialLabel(item.commercialStatus || 'none', t)}</StatusBadge>
          <span className="equipment-ops-card__type-chip">{item.equipmentType || item.type || t('equipment_type_default')}</span>
        </div>
        <ActionRail compact className="equipment-ops-card__overlay-actions" onClick={(event) => event.stopPropagation()}>
          <ActionRailButton className="equipment-ops-card__overlay-action" onClick={() => onOpenCard?.()}>{t('open')}</ActionRailButton>
          <ActionRailButton className="equipment-ops-card__overlay-action" tone="brand" onClick={() => onOpenServiceCase()}>{quickActionLabel}</ActionRailButton>
          <ActionRailButton className="equipment-ops-card__overlay-action" onClick={() => onOpenPhotos?.()}>{t('photo')}</ActionRailButton>
          {onOptionalAction ? <ActionRailButton className="equipment-ops-card__overlay-action" onClick={() => onOptionalAction?.()}>{t('sales')}</ActionRailButton> : null}
        </ActionRail>
      </div>

      <p className="equipment-ops-card__title">{modelTitle}</p>
      <div className="equipment-ops-card__meta">
        <span><Icon name="equipment" /> {item.internalNumber || '—'} / {item.serial || '—'}</span>
        <span><Icon name="clients" /> {ownerMeta}</span>
        <span><Icon name="employees" /> {t('master_empty').replace('—', assignedMaster)}</span>
        <span><Icon name="dashboard" /> {t('updated')}: {formatDate(item.updatedAt, locale)}</span>
      </div>

      <div className="equipment-ops-card__scan-chips">
        <em>{item.serviceStatus || '—'}</em>
        {hasActiveCase ? <em>{t('active_case_short')}: {item.activeServiceCaseId}</em> : <em>{t('no_active_case_short')}</em>}
      </div>

      {shortWarnings.length ? (
        <div className="warning-badges">
          {shortWarnings.map((warning) => <span key={warning}>{t(ALERT_LABEL_KEYS[warning] || warning)}</span>)}
          {warnings.length > shortWarnings.length ? <span>+{warnings.length - shortWarnings.length}</span> : null}
        </div>
      ) : null}

    </article>
  );
}

function classifyEquipmentColumn(item) {
  const serviceStatus = String(item.serviceStatus || item.activeServiceCaseStatus || '').trim();
  const commercialStatus = String(item.commercialStatus || '').trim();
  const warnings = item.warnings || [];

  if (commercialStatus === 'issued_to_client') return 'client';
  if (RENT_STATUSES.has(commercialStatus)) return 'rent';
  if (SALE_STATUSES.has(commercialStatus)) return 'sale';
  if (serviceStatus === 'ready') return 'ready';
  if (warnings.length) return 'attention';
  return 'service';
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

function EquipmentBoardToolbar({ boardNavItems, onBoardNav, t }) {
  return (
    <div className="equipment-list-toolbar">
      <div className="equipment-list-toolbar__copy">
        <small>{t('equipment_lane')}</small>
        <strong>{t('equipment_lane')}</strong>
      </div>
      <div className="equipment-board-nav" aria-label={t('navigate_columns')}>
        {boardNavItems.map((column) => (
          <button key={column.key} type="button" className="equipment-board-nav__chip" onClick={() => onBoardNav?.(column.key)}>
            <span>{column.label}</span>
            <strong>{column.count}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function MediaGallery({ rows = [], onOpen, equipmentId, onCoverSelect, onDelete, t, locale }) {
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
    return values.sort((a, b) => String(b).localeCompare(String(a), locale === 'uk' ? 'uk-UA' : 'ru-RU'));
  }, [rows]);

  const filtered = useMemo(() => rows.filter((item) => {
    if (typeFilter !== 'all' && item.mediaType !== typeFilter) return false;
    if (caseFilter !== 'all' && (item.serviceCaseId || 'no_case') !== caseFilter) return false;
    return true;
  }), [rows, typeFilter, caseFilter]);

  if (!rows.length) return <p className="empty-copy">{t('no_media_for_equipment')}</p>;

  return (
    <div className="equipment-detail-section equipment-gallery-shell">
      <div className="equipment-media-filters equipment-media-filters--compact">
        <div className="quick-filter-row quick-filter-row--compact">
          {[
            { key: 'all', label: t('all') },
            { key: 'photo', label: t('photo') },
            { key: 'video', label: t('video') },
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
          <button type="button" className={caseFilter === 'all' ? 'active' : ''} onClick={() => setCaseFilter('all')}>{t('all_cases')}</button>
          <button type="button" className={caseFilter === 'no_case' ? 'active' : ''} onClick={() => setCaseFilter('no_case')}>{t('no_case')}</button>
          {caseOptions.map((serviceCaseId) => (
            <button key={serviceCaseId} type="button" className={caseFilter === serviceCaseId ? 'active' : ''} onClick={() => setCaseFilter(serviceCaseId)}>
              {t('request_card_title')} {serviceCaseId}
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
                    <span>{t('file_unavailable')}</span>
                  </div>
                )}

                <div className="equipment-gallery-card__actions">
                  {isRenderable ? (
                    <button type="button" className="equipment-gallery-card__action" onClick={() => onOpen(originalIndex)}>
                      {t('open')}
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
                      {isCover ? t('on_card') : t('set_on_card')}
                    </button>
                  ) : null}
                  {onDelete ? (
                    <button type="button" className="equipment-gallery-card__action danger" onClick={() => onDelete(media)}>
                      {t('delete')}
                    </button>
                  ) : null}
                </div>
                <div className="equipment-gallery-card__footer">
                  <strong>{getMediaDisplayTitle(media, t('broken_file'), t)}</strong>
                  <span>{formatDate(media.createdAt, locale)}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {!filtered.length ? <p className="empty-copy media-empty">{t('no_files_for_filter')}</p> : null}
    </div>
  );
}

function Lightbox({ rows = [], index, onClose, onNavigate, t, locale }) {
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
          <p>{getMediaDisplayTitle(media, '—', t)}</p>
          <small>{media.uploadedByUser?.fullName || media.uploadedBy || '—'} · {formatDate(media.createdAt, locale)}</small>
          {media.serviceCaseId ? <small>{t('request_card_title')}: {media.serviceCaseId}</small> : null}
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

function TimelineView({ rows = [], t, locale }) {
  if (!rows.length) return <p className="empty-copy">{t('history_missing')}</p>;
  const normalized = [...rows].sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

  return (
    <ul className="equipment-history-list equipment-history-list--typed">
      {normalized.map((row) => {
        const meta = EVENT_META[row.type] || EVENT_META.legacy_event;
        return (
          <li key={row.id} className={`event-item event-item--${meta.tone}`}>
            <header>
              <span className="event-item__badge">
                <Icon name={meta.icon} /> {t(meta.labelKey)}
              </span>
              <small>{formatDate(row.timestamp, locale)}</small>
            </header>
            <p><strong>{row.payload?.fromStatus || '—'} → {row.payload?.toStatus || '—'}</strong></p>
            <p>{row.comment || t('no_comment')}</p>
            <small>{t('author')}: {row.actor || t('system_user')}{row.payload?.serviceCaseId ? ` · ${t('request_card_title').toLowerCase()} ${row.payload.serviceCaseId}` : ''}</small>
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
  t,
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
      setFeedback(t('commercial_action_done'));
    } catch {
      setError(t('commercial_action_failed'));
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
      setFeedback(t('media_added_to_case'));
      await onQuickMediaUploaded?.();
    } catch {
      setError(t('upload_media_failed'));
    } finally {
      setActionLoading('');
    }
  }

  return (
    <section className="equipment-detail-section equipment-action-panel">
      <header>
        <h4>{t('action_panel')}</h4>
        <p>{t('equipment_actions_description')}</p>
      </header>

      <ActionRail>
        <ActionRailButton tone="brand" disabled={!activeCase?.id} onClick={() => activeCase?.id && navigateToBoard('service_case', activeCase.id)}>
          {t('open_active_case')}
        </ActionRailButton>
        <ActionRailButton onClick={() => navigateToBoard('service_flow', detail?.equipment?.id)}>{t('service_flow')}</ActionRailButton>
        <ActionRailButton onClick={() => navigateToBoard('service_board', detail?.equipment?.id)}>{t('service_board')}</ActionRailButton>
        <ActionRailButton onClick={() => navigateToBoard('director_board', detail?.equipment?.id)}>{t('nav_director')}</ActionRailButton>
        <ActionRailButton onClick={() => navigateToBoard('sales_board', detail?.equipment?.id)}>{t('sales')}</ActionRailButton>
      </ActionRail>

      {canUploadCaseMedia ? (
        <div className="equipment-action-panel__media">
          <h5>{t('quick_media_add')}</h5>
          {!activeCase?.id ? <p className="empty-copy">{t('active_case_not_found_upload')}</p> : null}
          <input type="file" multiple accept="image/*,video/*" onChange={(event) => setQuickMediaFiles(Array.from(event.target.files || []))} />
          <input
            type="text"
            value={quickMediaCaption}
            onChange={(event) => setQuickMediaCaption(event.target.value)}
            placeholder={t('media_comment_placeholder')}
          />
          <button
            type="button"
            className="equipment-action-panel__upload-btn"
            disabled={!activeCase?.id || !quickMediaFiles.length || Boolean(actionLoading)}
            onClick={() => submitQuickMedia()}
          >
            {actionLoading === 'media' ? t('loading') : t('upload_media_to_active_case')}
          </button>
        </div>
      ) : null}

      {canCommercialOperate ? (
        <div className="equipment-action-panel__commercial">
          <h5>{t('quick_commercial_actions')}</h5>
          <ActionRail>
            {commercialActions.map((action) => (
              <ActionRailButton
                disabled={Boolean(actionLoading)}
                key={action.key + action.targetStatus}
                tone={action.key.startsWith('reserve') ? 'brand' : 'default'}
                onClick={() => applyCommercialAction(action)}
              >
                {actionLoading === `commercial:${action.key}:${action.targetStatus || ''}` ? t('saving') : action.label}
              </ActionRailButton>
            ))}
            {!commercialActions.length ? <span className="empty-copy">{t('no_actions')}</span> : null}
          </ActionRail>
        </div>
      ) : null}

      <p className="equipment-action-panel__links">
        {t('quick_links')}: <a href={`${basePath}/service`}>{t('service_board')}</a> · <a href={`${basePath}/director`}>{t('director_board')}</a> · <a href={`${basePath}/sales`}>{t('sales_board')}</a>
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
  t,
  locale,
}) {
  const [commentBody, setCommentBody] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [editForm, setEditForm] = useState({ brand: '', model: '', serial: '', internalNumber: '' });
  const [busy, setBusy] = useState('');
  if (!detail) return <p className="empty-copy">{t('equipment_unit_select')}</p>;
  const equipment = detail.equipment || {};
  const activeCase = detail.serviceCases?.find((item) => item.isActive) || null;
  const latestMedia = (detail.media || [])[0] || null;
  const warnings = getEquipmentWarnings(detail, t);
  const latestTimelineEvent = (detail.timeline || [])[0] || null;
  if (tab === 'overview') {
    const passportStats = [
      { key: 'service', label: t('service_label'), value: activeCase?.serviceStatus || equipment.serviceStatus || '—', meta: activeCase?.id || t('no_active_case') },
      { key: 'commerce', label: t('commerce'), value: getCommercialLabel(equipment.commercialStatus || 'none', t), meta: equipment.ownerType || '—' },
      { key: 'updated', label: t('updated'), value: formatDay(equipment.updatedAt, locale, '—'), meta: formatDate(equipment.updatedAt, locale) },
      { key: 'case', label: t('active_service_case'), value: activeCase?.id || '—', meta: activeCase?.assignedToUser?.fullName || activeCase?.assignedToUserId || t('not_assigned') },
    ];
    const passportFields = [
      { key: 'client', icon: 'clients', label: t('client'), value: equipment.clientName || '—' },
      { key: 'owner', icon: 'equipment', label: t('owner_type'), value: equipment.ownerType || '—' },
      { key: 'brand', icon: 'dashboard', label: t('brand'), value: equipment.brand || '—' },
      { key: 'model', icon: 'equipment', label: t('model'), value: equipment.model || '—' },
      { key: 'inventory', icon: 'sales', label: t('inventory_number'), value: equipment.internalNumber || '—' },
      { key: 'serial', icon: 'service', label: t('serial_number'), value: equipment.serial || '—' },
    ];

    return (
      <section className="equipment-detail-section equipment-passport-overview">
        {canCreateEquipment ? (
          <ActionRail compact>
            <ActionRailButton tone="brand" onClick={() => navigateToBoard('equipment_create')}>{t('add_equipment')}</ActionRailButton>
            <ActionRailButton onClick={() => navigateToBoard('equipment_intake')}>{t('intake_equipment')}</ActionRailButton>
          </ActionRail>
        ) : null}
        <div className="equipment-passport-layout">
          <article className="equipment-summary-hero equipment-summary-hero--passport">
            <div className="equipment-summary-hero__copy">
              <small>{t('equipment_passport')}</small>
              <h4>{equipment.brand || '—'} {equipment.model || ''}</h4>
              <p>{equipment.id || '—'} · {equipment.internalNumber || '—'} / {equipment.serial || '—'}</p>
              <div className="equipment-summary-hero__statuses">
                <StatusBadge status={activeCase?.serviceStatus || equipment.serviceStatus || 'none'}>{t('service_label')}: {activeCase?.serviceStatus || equipment.serviceStatus || '—'}</StatusBadge>
                <StatusBadge status={equipment.commercialStatus || 'none'}>{t('commerce')}: {getCommercialLabel(equipment.commercialStatus || 'none', t)}</StatusBadge>
              </div>
              <div className="equipment-passport-stats">
                {passportStats.map((item) => (
                  <article key={item.key} className="equipment-passport-stat">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.meta}</small>
                  </article>
                ))}
              </div>
            </div>
            {latestMedia
              ? (
                <button type="button" className="equipment-summary-hero__preview" onClick={() => onOpenMedia(0)}>
                  {latestMedia.mediaType === 'video'
                    ? <video src={latestMedia.previewUrl || latestMedia.fullUrl} muted playsInline preload="metadata" />
                    : <img src={latestMedia.previewUrl || latestMedia.fullUrl} alt={latestMedia.caption || latestMedia.originalName || t('latest_media')} loading="lazy" />}
                </button>
              )
              : <div className="equipment-summary-hero__preview equipment-summary-hero__preview--empty">{t('no_preview')}</div>}
          </article>

          <article className="equipment-passport-workflow">
            <header className="equipment-passport-workflow__header">
              <div>
                <small>{t('workflow')}</small>
                <h4>{t('action_panel')}</h4>
              </div>
              <StatusBadge status={activeCase?.serviceStatus || equipment.serviceStatus || 'none'}>
                {activeCase?.serviceStatus || equipment.serviceStatus || '—'}
              </StatusBadge>
            </header>
            {activeCase ? (
              <div className="equipment-active-case-highlight equipment-active-case-highlight--passport">
                <header>
                  <h4>{t('active_service_case')}</h4>
                  <StatusBadge status={activeCase.serviceStatus || 'none'}>{activeCase.serviceStatus || '—'}</StatusBadge>
                </header>
                <p><strong>{activeCase.id}</strong> · {t('assigned_lower')}: {activeCase.assignedToUser?.fullName || activeCase.assignedToUserId || t('not_assigned')}.</p>
                <p>{t('updated_lower')}: {formatDate(activeCase.updatedAt, locale)}.</p>
                <button type="button" onClick={() => navigateToBoard('service_case', activeCase.id)}>{t('open_case')}</button>
              </div>
            ) : (
              <div className="equipment-passport-workflow__empty">
                <strong>{t('no_active_case')}</strong>
                <p>{t('missing_active_service_case')}</p>
              </div>
            )}
            <div className="equipment-passport-workflow__meta">
              <article>
                <span>{t('assignee')}</span>
                <strong>{activeCase?.assignedToUser?.fullName || activeCase?.assignedToUserId || t('not_assigned')}</strong>
              </article>
              <article>
                <span>{t('status')}</span>
                <strong>{getCommercialLabel(equipment.commercialStatus || 'none', t)}</strong>
              </article>
              <article>
                <span>{t('history')}</span>
                <strong>{latestTimelineEvent?.actor || t('system_user')}</strong>
                <small>{latestTimelineEvent?.comment || t('history_empty')}</small>
              </article>
            </div>
          </article>
        </div>

        {warnings.length ? (
          <div className="warning-badges">
            {warnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        ) : null}

        <section className="equipment-passport-data">
          <header className="equipment-passport-data__header">
            <div>
              <small>{t('equipment_passport')}</small>
              <h4>{t('overview')}</h4>
            </div>
            <p>{t('equipment_center_description')}</p>
          </header>
          <div className="equipment-passport-data__grid">
            {passportFields.map((field) => (
              <article key={field.key} className="equipment-passport-data__item">
                <span><Icon name={field.icon} /> {field.label}</span>
                <strong>{field.value}</strong>
              </article>
            ))}
            <article className="equipment-passport-data__item">
              <span><Icon name="dashboard" /> {t('active_service_case')}</span>
              <strong>{activeCase?.id || '—'}</strong>
            </article>
            <article className="equipment-passport-data__item">
              <span><Icon name="employees" /> {t('assignee')}</span>
              <strong>{activeCase?.assignedToUser?.fullName || activeCase?.assignedToUserId || '—'}</strong>
            </article>
            <article className="equipment-passport-data__item">
              <span><Icon name="service" /> {t('current_service_status')}</span>
              <strong>{activeCase?.serviceStatus || equipment.serviceStatus || '—'}</strong>
            </article>
            <article className="equipment-passport-data__item">
              <span><Icon name="sales" /> {t('current_commercial_status')}</span>
              <strong>{getCommercialLabel(equipment.commercialStatus || 'none', t)}</strong>
            </article>
          </div>
        </section>

        <div className="equipment-passport-ops-grid">
          {canEditEquipment ? (
            <article className="detail-section-card equipment-edit-passport-card">
              <header className="equipment-edit-passport-card__header">
                <div>
                  <small>{t('equipment')}</small>
                  <h4>{t('edit_equipment_card')}</h4>
                </div>
                <p>{t('equipment_actions_description')}</p>
              </header>
              <div className="equipment-detail-grid">
                <input placeholder={equipment.brand || t('brand')} value={editForm.brand} onChange={(e) => setEditForm((p) => ({ ...p, brand: e.target.value }))} />
                <input placeholder={equipment.model || t('model')} value={editForm.model} onChange={(e) => setEditForm((p) => ({ ...p, model: e.target.value }))} />
                <input placeholder={equipment.serial || t('serial_number')} value={editForm.serial} onChange={(e) => setEditForm((p) => ({ ...p, serial: e.target.value }))} />
                <input placeholder={equipment.internalNumber || t('inventory_number')} value={editForm.internalNumber} onChange={(e) => setEditForm((p) => ({ ...p, internalNumber: e.target.value }))} />
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
                  {busy === 'edit' ? t('saving') : t('save_card')}
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
            t={t}
          />
        </div>
      </section>
    );
  }
  if (tab === 'media') {
    const activeCase = detail.serviceCases?.find((item) => item.isActive) || null;
    return (
      <section className="equipment-detail-section">
        <article className="detail-section-card">
          <h4>{t('media_upload')}</h4>
          <p>{t('media_upload_description')}</p>
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
                  const toCase = activeCase?.id && window.confirm(t('upload_to_case_confirm').replace('{id}', activeCase.id));
                  await adminServiceApi.uploadEquipmentMedia(detail.equipment.id, files, { serviceCaseId: toCase ? activeCase.id : null });
                  if (fileInput) fileInput.value = '';
                  await onRefreshDetail?.();
                }}
              >{t('upload')}</ActionRailButton>
            </ActionRail>
          </div>
        ) : null}
        <MediaGallery
          rows={detail.media || []}
          onOpen={onOpenMedia}
          equipmentId={detail.equipment?.id}
          onCoverSelect={onRefreshDetail}
          onDelete={canDeleteEquipmentMedia ? ((media) => adminServiceApi.deleteMedia(media.id).then(() => onRefreshDetail?.())) : null}
          t={t}
          locale={locale}
        />
      </section>
    );
  }
  if (tab === 'history') return <TimelineView rows={detail.timeline || []} t={t} locale={locale} />;
  if (tab === 'service_cases') {
    const rows = detail.serviceCases || [];
    if (!rows.length) return <p className="empty-copy">{t('no_cases_found')}</p>;
    const activeCase = rows.find((row) => row.isActive) || null;
    const pastCases = rows.filter((row) => !row.isActive);
    return (
      <div className="equipment-cases-list">
        <section className="detail-section-card equipment-case-focus">
          <h4>{t('active_service_case')}</h4>
          {activeCase ? (
            <article className="equipment-case-card equipment-case-card--active">
              <header>
                <strong>{activeCase.id}</strong>
                <span className="signal-chip signal-chip--critical">{t('active_case_flag')}</span>
              </header>
              <p>{t('status')}: {activeCase.serviceStatus || '—'}</p>
              <p>{t('assignee')}: {activeCase.assignedToUser?.fullName || activeCase.assignedToUserId || '—'}</p>
              <p>{t('created')}: {formatDate(activeCase.createdAt, locale)} · {t('updated')}: {formatDate(activeCase.updatedAt, locale)}</p>
              <a href={`${basePath}/service?caseId=${encodeURIComponent(activeCase.id)}`}>{t('open_case_detail')}: {activeCase.id}</a>
            </article>
          ) : <p className="empty-copy">{t('no_active_case')}</p>}
        </section>

        <section className="detail-section-card equipment-case-history-block">
          <h4>{t('past_service_cases')} ({pastCases.length})</h4>
          {!pastCases.length ? <p className="empty-copy">{t('no_past_case_history')}</p> : null}
          {pastCases.map((row) => (
            <article key={row.id} className="equipment-case-card">
              <header>
                <strong>{row.id}</strong>
                <StatusBadge status={row.serviceStatus || 'none'}>{row.serviceStatus || '—'}</StatusBadge>
              </header>
              <p>{t('assignee')}: {row.assignedToUser?.fullName || row.assignedToUserId || '—'}</p>
              <p>{t('created')}: {formatDate(row.createdAt, locale)} · {t('updated')}: {formatDate(row.updatedAt, locale)}</p>
              <a href={`${basePath}/service?caseId=${encodeURIComponent(row.id)}`}>{t('open_case')} {row.id}</a>
            </article>
          ))}
        </section>
      </div>
    );
  }
  if (tab === 'notes') {
    const rows = [...(detail.equipmentNotes || []), ...(detail.notes || [])];
    if (!rows.length) return <p className="empty-copy">{t('notes_empty')}</p>;
    return (
      <section className="equipment-detail-section">
        <div className="detail-composer">
          <input value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder={t('equipment_note_placeholder')} />
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
            >{busy === 'note' ? t('saving') : t('add_note')}</ActionRailButton>
          </ActionRail>
        </div>
        <ul className="equipment-notes-list detail-list">
          {rows.map((row) => (
            <li key={row.id} className="detail-list__item">
              <p>{row.body}</p>
              <small>{row.authorUser?.fullName || '—'} · {formatDate(row.createdAt, locale)} · {t('request_card_title').toLowerCase()} {row.serviceCaseId || '—'}</small>
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
          <input value={commentBody} onChange={(e) => setCommentBody(e.target.value)} placeholder={t('equipment_comment_placeholder')} />
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
            >{busy === 'comment' ? t('saving') : t('add_comment')}</ActionRailButton>
          </ActionRail>
        </div>
        {!rows.length ? <p className="empty-copy">{t('comments_empty')}</p> : (
          <ul className="equipment-notes-list detail-list">
            {rows.map((row) => <li key={row.id} className="detail-list__item"><p>{row.body}</p><small>{row.authorUser?.fullName || '—'} · {formatDate(row.createdAt, locale)}</small></li>)}
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
            <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder={t('task_title')} />
            <input value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder={t('description')} />
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
            >{busy === 'task' ? t('creating') : t('create_task')}</ActionRailButton>
          </ActionRail>
        </div>
        {!rows.length ? <p className="empty-copy">{t('tasks_empty')}</p> : (
          <ul className="equipment-notes-list detail-list">
            {rows.map((row) => (
              <li key={row.id} className="detail-list__item">
                <p><strong>{row.title}</strong> — {row.description || t('no_description_short')}</p>
                <small>{row.status} · {row.assignedToUser?.fullName || t('not_assigned')} · {t('due')} {formatDate(row.dueAt, locale)}</small>
                <ActionRail compact>
                  {['todo', 'in_progress', 'done'].map((status) => (
                    <ActionRailButton key={status} active={row.status === status} tone={row.status === status ? 'brand' : 'default'} onClick={() => adminServiceApi.updateTaskStatus(row.id, status).then(() => onRefreshDetail?.())}>{t(`task_${status}`) || status}</ActionRailButton>
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
        <p>{t('equipment_documents_description')}</p>
        <p>{t('passport_link')}: {detail.equipment?.passportPdfUrl || '—'}</p>
      </section>
    );
  }

  const actions = detail.currentActions?.all || [];
  return (
    <section className="equipment-detail-section">
      <p>{t('current_commercial_status')}: {getCommercialLabel(detail.equipment?.commercialStatus || 'none', t)}</p>
      <ActionRail>
        {actions.map((action) => <ActionRailButton key={action.key + action.targetStatus}>{action.label}</ActionRailButton>)}
        {!actions.length ? <span className="empty-copy">{t('no_actions')}</span> : null}
      </ActionRail>
    </section>
  );
}

export function AdminEquipmentPage() {
  const { user } = useAuth();
  const { t, locale } = useAdminI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { equipmentId } = useParams();

  const [dashboard, setDashboard] = useState({ kpi: {}, alerts: [] });
  const [items, setItems] = useState([]);
  const [detail, setDetail] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [searchTerm, setSearchTerm] = useState('');
  const boardRef = useRef(null);
  const boardColumnRefs = useRef({});
  const canCreateEquipment = [ROLES.manager, ROLES.serviceHead, ROLES.owner, ROLES.director].includes(user?.role);
  const canEditEquipment = [ROLES.manager, ROLES.serviceHead, ROLES.owner, ROLES.director].includes(user?.role);
  const canUploadEquipmentMedia = [ROLES.manager, ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director].includes(user?.role);
  const canDeleteEquipmentMedia = [ROLES.manager, ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director].includes(user?.role);
  const canCommercialOperate = [ROLES.manager, ROLES.salesManager, ROLES.owner, ROLES.director].includes(user?.role);
  const canUploadCaseMedia = [ROLES.manager, ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director].includes(user?.role);

  const basePath = getBaseAdminPath(location.pathname);
  const warningFilter = String(searchParams.get('warning') || '').trim();

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
  }

  async function loadDetail(id) {
    if (!id) return setDetail(null);
    const payload = await adminServiceApi.equipmentDetail(id);
    setDetail(payload.item || null);
  }

  useEffect(() => {
    loadDashboard().catch(() => setDashboard({ kpi: {}, alerts: [] }));
    loadList().catch(() => setItems([]));
  }, [searchParams, equipmentId]); // eslint-disable-line

  useEffect(() => {
    loadDetail(equipmentId).catch(() => setDetail(null));
  }, [equipmentId]);

  const mediaRows = useMemo(() => (detail?.media || []).slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [detail]);
  const filteredItems = useMemo(
    () => items.filter((item) => matchesSearch(item, searchTerm)),
    [items, searchTerm],
  );
  const boardColumns = useMemo(() => EQUIPMENT_BOARD_COLUMNS.map((column) => ({
    ...column,
    label: t(column.labelKey),
    eyebrow: t(column.eyebrowKey),
    items: filteredItems.filter((item) => classifyEquipmentColumn(item) === column.key),
  })), [filteredItems, t]);
  const boardNavItems = useMemo(() => [
    { key: 'summary', label: t('summary'), count: dashboard?.kpi?.totalEquipment || 0 },
    ...boardColumns.map((column) => ({ key: column.key, label: column.label, count: column.items.length })),
  ], [boardColumns, dashboard, t]);
  const tabs = useMemo(() => TABS.map((tab) => ({ ...tab, label: t(tab.labelKey) })), [t]);

  function selectEquipment(id) {
    navigate(`${basePath}/equipment/${id}`);
  }

  function closeDetail() {
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

  function scrollToBoardColumn(key) {
    const container = boardRef.current;
    const target = boardColumnRefs.current[key];
    if (!container || !target) return;
    const gap = 12;
    const nextLeft = Math.max(target.offsetLeft - gap, 0);
    container.scrollTo({ left: nextLeft, behavior: 'smooth' });
  }

  const detailRouteMode = Boolean(equipmentId);
  const detailEquipment = detail?.equipment || null;
  const detailActiveCase = detail?.serviceCases?.find((item) => item.isActive) || null;
  const detailPreview = (mediaRows || [])[0] || null;

  return (
    <section className="equipment-ops-page">
      <header className="equipment-command">
        <div>
          <small>{t('equipment_registry')}</small>
          <h2>{t('equipment_center')}</h2>
          <p>{t('equipment_center_description')}</p>
        </div>
      </header>
      {!detailRouteMode ? (
        <section className="equipment-ops-board-page">
          <div className="equipment-board-toolbar-shell">
            <div className="equipment-list-search">
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t('equipment_search_placeholder')}
              />
            </div>
            <EquipmentBoardToolbar
              boardNavItems={boardNavItems}
              onBoardNav={scrollToBoardColumn}
              t={t}
            />
          </div>
          <div className="equipment-ops-list equipment-ops-list--full equipment-board-shell">
            <div ref={boardRef} className="equipment-board">
              <div ref={(node) => { boardColumnRefs.current.summary = node; }} className="equipment-board-column-anchor">
                <DashboardSummaryColumn
                  dashboard={dashboard}
                  onAlertClick={onAlertClick}
                  activeWarning={warningFilter}
                  onResetWarning={resetWarningFilter}
                  t={t}
                />
              </div>
              {boardColumns.map((column) => (
                <section
                  key={column.key}
                  ref={(node) => { boardColumnRefs.current[column.key] = node; }}
                  className="equipment-board-column"
                  data-accent={column.accent}
                >
                  <header className="equipment-board-column__header">
                    <div>
                      <small>{column.eyebrow}</small>
                      <h4>{column.label}</h4>
                    </div>
                    <strong>{column.items.length}</strong>
                  </header>
                  <div className="equipment-board-column__cards">
                    {column.items.map((item) => (
                      <EquipmentListCard
                        key={item.id}
                        item={item}
                        viewMode="list"
                        active={equipmentId === item.id}
                        onClick={() => selectEquipment(item.id)}
                        onOpenCard={() => selectEquipment(item.id)}
                        onOpenPhotos={() => { setActiveTab('media'); selectEquipment(item.id); }}
                        onOpenServiceCase={() => navigateToBoard(item.activeServiceCaseId ? 'service_case' : 'service_board', item.activeServiceCaseId || item.id)}
                        onOptionalAction={() => navigateToBoard('sales_board', item.id)}
                        t={t}
                        locale={locale}
                      />
                    ))}
                    {!column.items.length ? <p className="empty-copy">{t('queue_empty')}</p> : null}
                  </div>
                </section>
              ))}
            </div>
            {!filteredItems.length ? <p className="empty-copy">{t('no_equipment_for_filter')}</p> : null}
          </div>
        </section>
      ) : (
        <section className="equipment-ops-detail-page">
        <article className="equipment-ops-detail equipment-ops-detail--page">
          <button type="button" className="equipment-back-button" onClick={closeDetail}>{t('back_to_board')}</button>
          <header className="equipment-ops-detail__hero">
            <div className="equipment-ops-detail__hero-copy">
              <div className="equipment-ops-detail__hero-topline">
                <div>
                  <small>{t('equipment_passport')}</small>
                  <h3>{detailEquipment ? `${detailEquipment.brand || '—'} ${detailEquipment.model || ''}` : t('choose_equipment')}</h3>
                  <p>{detailEquipment ? `${detailEquipment.id || '—'} · ${detailEquipment.internalNumber || '—'} / ${detailEquipment.serial || '—'}` : t('choose_equipment_from_board')}</p>
                </div>
                {detailEquipment ? (
                  <div className="equipment-ops-detail__hero-statuses">
                    <StatusBadge status={detailActiveCase?.serviceStatus || detailEquipment.serviceStatus || 'none'}>
                      {t('service_label')}: {detailActiveCase?.serviceStatus || detailEquipment.serviceStatus || '—'}
                    </StatusBadge>
                    <StatusBadge status={detailEquipment.commercialStatus || 'none'}>
                      {getCommercialLabel(detailEquipment.commercialStatus || 'none', t)}
                    </StatusBadge>
                  </div>
                ) : null}
              </div>
              {detailEquipment ? (
                <div className="equipment-ops-detail__hero-stats">
                  <article>
                    <span>{t('client')}</span>
                    <strong>{detailEquipment.clientName || '—'}</strong>
                  </article>
                  <article>
                    <span>{t('owner_type')}</span>
                    <strong>{detailEquipment.ownerType || '—'}</strong>
                  </article>
                  <article>
                    <span>{t('active_service_case')}</span>
                    <strong>{detailActiveCase?.id || '—'}</strong>
                  </article>
                  <article>
                    <span>{t('updated')}</span>
                    <strong>{formatDay(detailEquipment.updatedAt, locale, '—')}</strong>
                  </article>
                </div>
              ) : null}
            </div>
            <div className="equipment-ops-detail__hero-preview">
              {detailPreview
                ? (
                  detailPreview.mediaType === 'video'
                    ? <video src={detailPreview.previewUrl || detailPreview.fullUrl} muted playsInline preload="metadata" />
                    : <img src={detailPreview.previewUrl || detailPreview.fullUrl} alt={detailPreview.caption || detailPreview.originalName || 'preview'} loading="lazy" />
                )
                : <div className="equipment-summary-hero__preview equipment-summary-hero__preview--empty">{t('no_preview')}</div>}
            </div>
          </header>

          {detailEquipment ? (
            <ActionRail className="equipment-ops-detail__hero-actions">
              <ActionRailButton tone="brand" onClick={() => setActiveTab('overview')}>{t('overview')}</ActionRailButton>
              <ActionRailButton onClick={() => setActiveTab('media')}>{t('photos_video')}</ActionRailButton>
              <ActionRailButton disabled={!detailActiveCase?.id} onClick={() => detailActiveCase?.id && navigateToBoard('service_case', detailActiveCase.id)}>{t('active_service_case')}</ActionRailButton>
              <ActionRailButton onClick={() => navigateToBoard('service_board', detailEquipment.id)}>{t('service_board')}</ActionRailButton>
              <ActionRailButton onClick={() => navigateToBoard('director_board', detailEquipment.id)}>{t('director_board')}</ActionRailButton>
              <ActionRailButton onClick={() => navigateToBoard('sales_board', detailEquipment.id)}>{t('sales_board')}</ActionRailButton>
            </ActionRail>
          ) : null}

          <div className="equipment-tabs">
            {tabs.map((tab) => (
              <button key={tab.key} type="button" className={activeTab === tab.key ? 'active' : ''} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>
            ))}
          </div>

          <TabPanel
            tab={activeTab}
            detail={{ ...detail, media: mediaRows }}
            onOpenMedia={setLightboxIndex}
            onRefreshDetail={() => loadDetail(detail?.equipment?.id || equipmentId)}
            navigateToBoard={navigateToBoard}
            basePath={basePath}
            canCreateEquipment={canCreateEquipment}
            canEditEquipment={canEditEquipment}
            canUploadEquipmentMedia={canUploadEquipmentMedia}
            canDeleteEquipmentMedia={canDeleteEquipmentMedia}
            canCommercialOperate={canCommercialOperate}
            canUploadCaseMedia={canUploadCaseMedia}
            t={t}
            locale={locale}
          />
        </article>
        </section>
      )}

      <Lightbox
        rows={mediaRows}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(-1)}
        onNavigate={(delta) => setLightboxIndex((prev) => Math.min(Math.max(prev + delta, 0), mediaRows.length - 1))}
        t={t}
        locale={locale}
      />
    </section>
  );
}
