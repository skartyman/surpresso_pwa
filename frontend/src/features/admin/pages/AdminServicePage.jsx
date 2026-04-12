import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { adminServiceApi } from '../api/adminServiceApi';
import { getAdminRoleProfile, ROLES } from '../roleConfig';
import { useAdminI18n } from '../adminI18n';
import {
  ActionRail,
  ActionRailButton,
  Icon,
  StatusBadge,
} from '../components/AdminUi';

const BOARD_COLUMNS = ['new', 'assigned', 'taken_in_work', 'ready_for_qc', 'on_service_head_control', 'to_director', 'invoiced'];
const DETAIL_TABS = ['overview', 'history', 'media', 'notes'];

function getBaseAdminPath(pathname = '') {
  return pathname.startsWith('/tg/admin') ? '/tg/admin' : '/admin';
}

function formatDate(value, locale = 'ru') {
  return value ? new Date(value).toLocaleString(locale === 'uk' ? 'uk-UA' : 'ru-RU') : '—';
}

function formatFileSize(size = 0) {
  const value = Number(size || 0);
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function getUploadErrorMessage(error, t) {
  const code = String(error?.message || '').trim();
  if (code === 'unsupported_media_type') return t('upload_media_invalid_type');
  if (code === 'media_file_too_large') return t('upload_media_too_large');
  if (code === 'too_many_media_files') return t('upload_media_too_many');
  return error?.message || t('upload_media_failed');
}

function isRequestMediaVideo(item) {
  return String(item?.mediaKind || item?.mimeType || item?.type || '').toLowerCase().includes('video');
}

function getRequestMediaVisualUrl(item) {
  return item?.previewUrl || item?.imgUrl || item?.fileUrl || item?.url || '';
}

function getRequestMode(request, t) {
  const type = String(request?.type || '').trim().toLowerCase();
  if (type === 'service_repair_visit') return { key: 'visit', label: t('request_mode_visit') };
  if (type === 'service_repair_remote') return { key: 'remote', label: t('request_mode_remote') };
  return { key: 'remote', label: t('request_mode_remote') };
}

function getUrgencyLabel(value, t) {
  const key = String(value || 'normal').trim().toLowerCase();
  return t(`urgency_${key}`) || key;
}

function getRequestPreview(request) {
  const rows = request?.media || [];
  return rows.find((item) => !isRequestMediaVideo(item) && getRequestMediaVisualUrl(item))
    || rows.find((item) => getRequestMediaVisualUrl(item))
    || null;
}

function splitMediaByStage(rows = []) {
  const grouped = { before: [], after: [], client: [] };
  rows.forEach((item) => {
    const stage = item.stage || 'client';
    if (!grouped[stage]) grouped[stage] = [];
    grouped[stage].push(item);
  });
  return grouped;
}

function getRoleActions(request, user, t) {
  const status = request?.status;
  const isEngineer = user?.role === ROLES.serviceEngineer;
  const isHead = [ROLES.serviceHead, ROLES.manager, ROLES.owner].includes(user?.role);
  const isDirector = [ROLES.director, ROLES.owner].includes(user?.role);
  const isBilling = [ROLES.salesManager, ROLES.director, ROLES.owner].includes(user?.role);
  const actions = [];

  if (isEngineer && !request?.assignedToUserId && ['new', 'assigned'].includes(status)) {
    actions.push({ kind: 'claim', label: t('take_in_work') });
  }
  if (isEngineer && request?.assignedToUserId === user?.id && status === 'assigned') {
    actions.push({ kind: 'status', status: 'taken_in_work', label: t('start_work') });
  }
  if (isEngineer && request?.assignedToUserId === user?.id && status === 'taken_in_work') {
    actions.push({ kind: 'status', status: 'ready_for_qc', label: t('send_to_qc') });
  }
  if (isHead && status === 'ready_for_qc') {
    actions.push({ kind: 'status', status: 'on_service_head_control', label: t('take_on_control') });
  }
  if (isHead && status === 'on_service_head_control') {
    actions.push({ kind: 'status', status: 'to_director', label: t('send_to_director') });
  }
  if (isDirector && status === 'to_director') {
    actions.push({ kind: 'status', status: 'invoiced', label: t('send_to_invoice') });
  }
  if (isBilling && status === 'invoiced') {
    actions.push({ kind: 'status', status: 'closed', label: t('close_request') });
  }
  return actions;
}

function ServiceQuickActions({ actions, loadingKey, onAction }) {
  if (!actions.length) return null;
  return (
    <ActionRail compact className="service-board-card__actions">
      {actions.map((action) => (
        <ActionRailButton
          key={`${action.kind}:${action.status || action.label}`}
          className={`service-board-card__action ${action.kind === 'claim' ? '' : 'secondary'}`}
          tone={action.kind === 'claim' ? 'brand' : 'default'}
          disabled={Boolean(loadingKey)}
          onClick={(event) => {
            event.stopPropagation();
            onAction(action);
          }}
        >
          {loadingKey === `${action.kind}:${action.status || 'claim'}` ? '...' : action.label}
        </ActionRailButton>
      ))}
    </ActionRail>
  );
}

function ServiceTicketCard({ request, active, user, actionLoading, onSelect, onAction, boardLabels, t, locale }) {
  const preview = getRequestPreview(request);
  const actions = getRoleActions(request, user, t);
  const requestMode = getRequestMode(request, t);
  const warnings = [];
  if (!request.assignedToUserId) warnings.push(t('no_engineer'));
  if (!request.equipmentId) warnings.push(t('no_equipment'));
  if (request.status === 'taken_in_work' && (request.media || []).filter((item) => item.stage === 'after').length === 0) warnings.push(t('no_after_photo'));

  return (
    <article className={`service-board-card ${active ? 'active' : ''}`} data-status={request.status}>
      <button type="button" className="service-board-card__body" onClick={() => onSelect(request.id)}>
        <div className="service-board-card__topbar">
          <StatusBadge status={request.status}>{boardLabels[request.status] || request.status}</StatusBadge>
          <div className="service-board-card__topbar-actions">
            <StatusBadge status={requestMode.key}>{requestMode.label}</StatusBadge>
            <small>#{request.id}</small>
          </div>
        </div>

        <div className="service-board-card__preview">
          {getRequestMediaVisualUrl(preview)
            ? (
              isRequestMediaVideo(preview)
                ? <video src={preview.fileUrl || getRequestMediaVisualUrl(preview)} muted playsInline preload="metadata" />
                : <img src={getRequestMediaVisualUrl(preview)} alt={request.equipment?.model || 'preview'} loading="lazy" />
            )
            : <div className="service-board-card__preview-empty"><Icon name="equipment" /><span>{t('no_photo')}</span></div>}
        </div>

        <div className="service-board-card__content">
          <strong>{request.pointUser?.fullName || request.client?.contactName || request.client?.companyName || t('client')}</strong>
          <p>{request.equipment?.brand || '—'} {request.equipment?.model || ''}</p>
          <p>{request.location?.name || request.equipment?.locationName || t('point_not_selected')}</p>
          <p>{request.description || t('no_description')}</p>
        </div>

        {warnings.length ? (
          <div className="warning-badges service-board-card__warnings">
            {warnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        ) : null}

        <div className="service-board-card__meta">
          <span><Icon name="employees" /> {request.assignedToUser?.fullName || t('not_assigned')}</span>
          <span><Icon name="clients" /> {request.client?.companyName || '—'}</span>
          <span><Icon name="clients" /> {request.pointUser?.phone || request.client?.phone || t('no_phone')}</span>
          <span><Icon name="service" /> <StatusBadge status={request.urgency || 'normal'}>{getUrgencyLabel(request.urgency, t)}</StatusBadge></span>
          <span><Icon name="equipment" /> {(request.media || []).length}</span>
        </div>

        <div className="service-board-card__footer">
          <div className="service-board-card__facts">
            <span><Icon name="dashboard" /> {(request.history || []).length}</span>
            <span><Icon name="content" /> {(request.notes || []).length}</span>
            <span><Icon name="service" /> {request.category || 'service'}</span>
          </div>
          <small>{formatDate(request.updatedAt, locale)}</small>
        </div>
      </button>

      <ServiceQuickActions actions={actions} loadingKey={actionLoading} onAction={onAction} />
    </article>
  );
}

function ServiceBoardToolbar({ boardNavItems, onBoardNav, t }) {
  return (
    <div className="equipment-list-toolbar">
      <div className="equipment-list-toolbar__copy">
        <small>Service lane</small>
        <strong>{t('service_lane')}</strong>
      </div>
      <div className="equipment-board-nav" aria-label={t('service_lane')}>
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

function ServiceSummaryColumn({ dashboard, t }) {
  const kpis = dashboard?.kpis || [];
  const attention = dashboard?.attention || [];

  return (
    <section className="equipment-board-column equipment-board-column--summary service-board-column-trello" data-accent="gold">
      <header className="equipment-board-column__header equipment-board-column__header--summary service-board-column-trello__header">
        <div>
          <small>Service pulse</small>
          <h4>{t('summary')}</h4>
        </div>
        <strong>{kpis.reduce((sum, item) => sum + Number(item.value || 0), 0)}</strong>
      </header>

      <div className="equipment-board-summary-grid">
        {kpis.slice(0, 6).map((item) => (
          <article key={item.key} className="equipment-board-summary-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{t('workflow')}</small>
          </article>
        ))}
      </div>

      <article className="equipment-hub-alerts equipment-hub-alerts--column">
        <header>
          <div>
            <small>{t('control')}</small>
            <h3>{t('attention')}</h3>
          </div>
          <small>{attention.reduce((sum, item) => sum + Number(item.value || 0), 0)} {t('signals')}</small>
        </header>
        <div className="equipment-hub-alerts__grid equipment-hub-alerts__grid--column">
          {attention.map((item) => (
            <button key={item.key} type="button" className="equipment-hub-alert equipment-hub-alert--warning">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </button>
          ))}
          {!attention.length ? <p className="empty-copy">{t('no_signals')}</p> : null}
        </div>
      </article>
    </section>
  );
}

function ServiceModeFilters({ value, onChange, t }) {
  const options = [
    { key: 'all', label: t('all') },
    { key: 'remote', label: t('request_mode_remote') },
    { key: 'visit', label: t('request_mode_visit') },
  ];
  return (
    <div className="quick-filter-row quick-filter-row--compact quick-filter-row--scrollable service-mode-filters">
      {options.map((item) => (
        <button key={item.key} type="button" className={value === item.key ? 'active' : ''} onClick={() => onChange(item.key)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

function RequestMediaLightbox({ rows = [], index = -1, onClose, onNavigate, t, locale }) {
  const media = rows[index];
  if (!media) return null;

  return (
    <div className="equipment-lightbox" role="dialog" aria-modal="true">
      <div className="equipment-lightbox__content">
        <button type="button" className="equipment-lightbox__close" onClick={onClose}>×</button>
        {isRequestMediaVideo(media)
          ? <video src={media.fileUrl || getRequestMediaVisualUrl(media)} controls autoPlay />
          : <img src={media.fileUrl || getRequestMediaVisualUrl(media)} alt={media.originalName || `media-${index + 1}`} />}
        <div className="equipment-lightbox__meta">
          <p>{media.originalName || (isRequestMediaVideo(media) ? t('video') : t('photo'))}</p>
          <small>{formatDate(media.createdAt, locale)}{media.stage ? ` · ${media.stage}` : ''}</small>
          {media.fileUrl ? <a href={media.fileUrl} target="_blank" rel="noreferrer">{t('open')}</a> : null}
        </div>
        <div className="equipment-lightbox__controls">
          <button type="button" disabled={index <= 0} onClick={() => onNavigate(-1)}>{t('previous')}</button>
          <span>{index + 1} / {rows.length}</span>
          <button type="button" disabled={index >= rows.length - 1} onClick={() => onNavigate(1)}>{t('next')}</button>
        </div>
        <div className="equipment-lightbox__carousel">
          {rows.map((item, thumbIndex) => (
            <button type="button" key={item.id || `${item.fileUrl}-${thumbIndex}`} className={thumbIndex === index ? 'active' : ''} onClick={() => onNavigate(thumbIndex - index)}>
              {isRequestMediaVideo(item)
                ? <video src={item.previewUrl || item.fileUrl} muted playsInline preload="metadata" />
                : <img src={getRequestMediaVisualUrl(item)} alt={item.originalName || `thumb-${thumbIndex + 1}`} loading="lazy" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminServicePage() {
  const { user } = useAuth();
  const { t, locale } = useAdminI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { requestId } = useParams();
  const roleProfile = useMemo(() => getAdminRoleProfile(user?.role), [user?.role]);
  const canAssign = roleProfile.service.showAssignmentPanel;
  const canDelete = [ROLES.serviceHead, ROLES.owner, ROLES.director].includes(user?.role);
  const canCreateRequest = [ROLES.serviceHead, ROLES.manager, ROLES.owner, ROLES.director].includes(user?.role);
  const canSeeInternalNotes = roleProfile.service.showInternalNotesComposer;
  const basePath = getBaseAdminPath(location.pathname);

  const [requests, setRequests] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [engineers, setEngineers] = useState([]);
  const [equipmentOptions, setEquipmentOptions] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [assignmentHistory, setAssignmentHistory] = useState([]);
  const [assignForm, setAssignForm] = useState({ assignedToUserId: '' });
  const [activeTab, setActiveTab] = useState('overview');
  const [noteBody, setNoteBody] = useState('');
  const [mediaFiles, setMediaFiles] = useState([]);
  const [mediaStage, setMediaStage] = useState('before');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [modeFilter, setModeFilter] = useState('all');
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    clientId: '',
    locationId: '',
    venueSearch: '',
    companyName: '',
    contactName: '',
    phone: '',
    locationName: '',
    category: 'coffee_machine',
    urgency: 'normal',
    serviceMode: 'remote',
    canOperateNow: true,
    description: '',
    assignedToUserId: '',
  });
  const [createMediaFiles, setCreateMediaFiles] = useState([]);
  const boardRef = useRef(null);
  const boardColumnRefs = useRef({});
  const refreshTimerRef = useRef(null);
  const boardLabels = useMemo(() => ({
    new: t('new'),
    assigned: t('assigned'),
    taken_in_work: t('taken_in_work'),
    ready_for_qc: t('ready_for_qc'),
    on_service_head_control: t('on_service_head_control'),
    to_director: t('to_director'),
    invoiced: t('invoiced'),
    closed: t('closed'),
    cancelled: t('cancelled'),
  }), [t]);
  const columnTheme = useMemo(() => ({
    new: { eyebrow: t('incoming_flow'), accent: 'blue' },
    assigned: { eyebrow: t('assignment'), accent: 'violet' },
    taken_in_work: { eyebrow: t('engineer'), accent: 'orange' },
    ready_for_qc: { eyebrow: t('review'), accent: 'teal' },
    on_service_head_control: { eyebrow: t('service_head'), accent: 'green' },
    to_director: { eyebrow: t('finalization'), accent: 'yellow' },
    invoiced: { eyebrow: t('documents'), accent: 'rose' },
  }), [t]);
  const tabLabels = useMemo(() => ({
    overview: t('overview'),
    history: t('history'),
    media: t('photos_video'),
    notes: t('notes'),
  }), [t]);
  const canReadServiceEngineers = [ROLES.manager, ROLES.serviceHead, ROLES.owner, ROLES.director].includes(user?.role);

  async function load() {
    setLoading(true);
    try {
      const [list, dash, engineerPayload] = await Promise.all([
        adminServiceApi.list({ sort: 'updatedAt' }),
        adminServiceApi.dashboard({}),
        canReadServiceEngineers
          ? adminServiceApi.serviceEngineers().catch(() => ({ engineers: [] }))
          : Promise.resolve({ engineers: [] }),
      ]);

      const rows = list.requests || [];
      setRequests(rows);
      setDashboard(dash || null);
      setEngineers(engineerPayload.engineers || []);
      if (canCreateRequest) {
        const equipmentPayload = await adminServiceApi.equipmentList({});
        const items = Array.isArray(equipmentPayload?.items) ? equipmentPayload.items : [];
        setEquipmentOptions(items);
      }
      setError('');
    } catch {
      setError(t('load_service_requests_failed'));
    } finally {
      setLoading(false);
    }
  }

  async function loadDetails(id) {
    const [payload, history] = await Promise.all([
      adminServiceApi.byId(id),
      adminServiceApi.assignmentHistory(id).catch(() => ({ history: [] })),
    ]);
    setSelectedRequest(payload.request || null);
    setAssignmentHistory(history.history || []);
    setAssignForm({ assignedToUserId: payload.request?.assignedToUserId || '' });
  }

  function scheduleRefresh() {
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      load().catch(() => {});
      if (requestId) loadDetails(requestId).catch(() => {});
    }, 250);
  }

  useEffect(() => { load(); }, [canReadServiceEngineers, canCreateRequest]); // eslint-disable-line
  useEffect(() => {
    let events = null;
    if (typeof EventSource !== 'undefined') {
      events = new EventSource('/api/telegram/admin/service-requests/events', { withCredentials: true });
      events.addEventListener('service-request', scheduleRefresh);
      events.onerror = () => {};
    }
    const handleFocus = () => {
      load().catch(() => {});
      if (requestId) loadDetails(requestId).catch(() => {});
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      if (events) events.close();
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [requestId, canReadServiceEngineers]); // eslint-disable-line
  useEffect(() => {
    if (!requestId) {
      setSelectedRequest(null);
      setAssignmentHistory([]);
      return;
    }
    loadDetails(requestId).catch(() => {
      setSelectedRequest(null);
      setAssignmentHistory([]);
    });
  }, [requestId]);

  async function runAction(action, request = selectedRequest) {
    if (!request) return;
    const busyKey = `${action.kind}:${action.status || (action.kind === 'delete' ? 'delete' : 'claim')}`;
    setActionLoading(busyKey);
    setError('');
    try {
      if (action.kind === 'delete') {
        if (!window.confirm(t('delete_service_request_confirm'))) return;
        await adminServiceApi.delete(request.id);
        await load();
        if (requestId === request.id) {
          navigate(`${basePath}/service`);
          setSelectedRequest(null);
        }
        setFeedback(t('delete_service_request_success'));
      } else if (action.kind === 'claim') {
        await adminServiceApi.assignManager(request.id, user.id, 'Engineer self-claimed request');
        await adminServiceApi.updateStatus(request.id, 'taken_in_work', 'Engineer started work');
        await load();
        if (requestId === request.id) {
          await loadDetails(request.id);
        }
        setFeedback(action.label);
      } else {
        await adminServiceApi.updateStatus(request.id, action.status, action.label);
        await load();
        if (requestId === request.id) {
          await loadDetails(request.id);
        }
        setFeedback(action.label);
      }
    } catch (actionError) {
      setError(actionError?.message || (action.kind === 'delete' ? t('delete_service_request_failed') : t('run_action_failed')));
    } finally {
      setActionLoading('');
    }
  }

  async function submitAssignment() {
    if (!requestId || !assignForm.assignedToUserId) return;
    setActionLoading('assign');
    setError('');
    try {
      await adminServiceApi.assignManager(requestId, assignForm.assignedToUserId, 'Assigned from service board');
      await load();
      await loadDetails(requestId);
      setFeedback(t('engineer_assigned'));
    } catch (assignError) {
      setError(assignError?.message || t('assign_engineer_failed'));
    } finally {
      setActionLoading('');
    }
  }

  async function submitNote() {
    if (!requestId || !noteBody.trim()) return;
    setActionLoading('note');
    setError('');
    try {
      await adminServiceApi.addNote(requestId, noteBody.trim());
      setNoteBody('');
      await loadDetails(requestId);
      setFeedback(t('note_added_success'));
    } catch (noteError) {
      setError(noteError?.message || t('save_note_failed'));
    } finally {
      setActionLoading('');
    }
  }

  async function submitMedia() {
    if (!requestId || !mediaFiles.length) return;
    setActionLoading('media');
    setError('');
    try {
      await adminServiceApi.uploadRequestMedia(requestId, mediaFiles, mediaStage);
      setMediaFiles([]);
      await load();
      await loadDetails(requestId);
      setFeedback(mediaStage === 'after' ? t('media_after_uploaded') : t('media_before_uploaded'));
    } catch (mediaError) {
      setError(getUploadErrorMessage(mediaError, t));
    } finally {
      setActionLoading('');
    }
  }

  const filteredRequests = useMemo(() => requests.filter((item) => {
    if (modeFilter !== 'all' && getRequestMode(item, t).key !== modeFilter) return false;
    if (!searchTerm.trim()) return true;
    const haystack = [
      item.id,
      item.client?.companyName,
      item.client?.contactName,
      item.pointUser?.fullName,
      item.location?.name,
      item.equipment?.brand,
      item.equipment?.model,
      item.description,
      item.assignedToUser?.fullName,
    ].join(' ').toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  }), [modeFilter, requests, searchTerm, t]);

  const visibleBoardStatuses = roleProfile.service.visibleStatuses;
  const boardColumns = useMemo(() => visibleBoardStatuses.map((status) => ({
    status,
    label: boardLabels[status],
    items: filteredRequests.filter((item) => item.status === status),
  })), [filteredRequests, boardLabels, visibleBoardStatuses]);
  const boardNavItems = useMemo(() => [
    ...(roleProfile.service.showSummary ? [{ key: 'summary', label: t('summary'), count: (dashboard?.kpis || []).reduce((sum, item) => sum + Number(item.value || 0), 0) }] : []),
    ...boardColumns.map((column) => ({ key: column.status, label: column.label, count: column.items.length })),
  ], [boardColumns, dashboard, roleProfile.service.showSummary, t]);
  const mediaGroups = splitMediaByStage(selectedRequest?.media || []);
  const selectedRequestMedia = selectedRequest?.media || [];
  const detailRouteMode = Boolean(requestId);
  const venueOptions = useMemo(() => {
    const seen = new Set();
    return equipmentOptions.reduce((acc, item) => {
      const clientId = String(item.clientId || '').trim();
      const locationId = String(item.locationId || '').trim();
      const companyName = String(item.clientName || item.companyName || '').trim();
      const locationName = String(item.locationName || item.clientLocation || item.address || '').trim();
      if (!clientId || !companyName) return acc;
      const key = `${clientId}:${locationId || locationName}`;
      if (seen.has(key)) return acc;
      seen.add(key);
      acc.push({
        key,
        clientId,
        locationId: locationId || '',
        companyName,
        locationName,
        label: locationName ? `${companyName} · ${locationName}` : companyName,
      });
      return acc;
    }, []).sort((a, b) => a.label.localeCompare(b.label, locale === 'uk' ? 'uk' : 'ru'));
  }, [equipmentOptions, locale]);
  const filteredVenueOptions = useMemo(() => {
    const query = String(createForm.venueSearch || '').trim().toLowerCase();
    if (!query) return venueOptions.slice(0, 8);
    return venueOptions
      .filter((item) => `${item.companyName} ${item.locationName}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [createForm.venueSearch, venueOptions]);

  function selectRequest(id) {
    navigate(`${basePath}/service/${id}`);
  }

  function closeDetail() {
    navigate(`${basePath}/service`);
  }

  function scrollToBoardColumn(key) {
    const container = boardRef.current;
    const target = boardColumnRefs.current[key];
    if (!container || !target) return;
    container.scrollTo({ left: Math.max(target.offsetLeft - 12, 0), behavior: 'smooth' });
  }

  async function submitCreateRequest(event) {
    event.preventDefault();
    if (!createForm.description.trim()) {
      setError(t('description_required'));
      return;
    }
    if (!createForm.clientId && !createForm.companyName.trim()) {
      setError(t('company_name_required'));
      return;
    }
    setActionLoading('create-request');
    setError('');
    try {
      const createdPayload = await adminServiceApi.createRequest({
        clientId: createForm.clientId || null,
        locationId: createForm.locationId || null,
        companyName: createForm.companyName.trim(),
        contactName: createForm.contactName.trim(),
        phone: createForm.phone.trim(),
        locationName: createForm.locationName.trim(),
        category: createForm.category,
        urgency: createForm.urgency,
        canOperateNow: createForm.canOperateNow,
        description: createForm.description.trim(),
        type: createForm.serviceMode === 'visit' ? 'service_repair_visit' : 'service_repair_remote',
        assignedToUserId: createForm.assignedToUserId || null,
        media: createMediaFiles,
      });
      await load();
      const created = createdPayload?.request || null;
      setFeedback(t('service_request_created'));
      setCreateOpen(false);
      setCreateForm((prev) => ({
        ...prev,
        clientId: '',
        locationId: '',
        venueSearch: '',
        companyName: '',
        contactName: '',
        phone: '',
        locationName: '',
        description: '',
        assignedToUserId: '',
        urgency: 'normal',
        serviceMode: 'remote',
        canOperateNow: true,
      }));
      setCreateMediaFiles([]);
      if (created?.id) {
        navigate(`${basePath}/service/${created.id}`);
      }
    } catch (createError) {
      setError(createError?.message || t('service_request_create_failed'));
    } finally {
      setActionLoading('');
    }
  }

  function openRequestMedia(item) {
    const index = selectedRequestMedia.findIndex((row) => row.id === item.id);
    if (index >= 0) setLightboxIndex(index);
  }

  return (
    <section className="service-dashboard">
      <header className="service-command">
        <div className="service-command__copy">
          <small>Service board</small>
          <h2>{t('service_board_heading')}</h2>
          <p>{t('service_board_description')}</p>
        </div>
        {canCreateRequest ? (
          <ActionRail className="service-command__actions">
            <ActionRailButton tone="brand" onClick={() => setCreateOpen((prev) => !prev)}>
              {createOpen ? t('cancel') : t('create_service_request')}
            </ActionRailButton>
          </ActionRail>
        ) : null}
        {canCreateRequest && createOpen ? (
          <form className="detail-section-card service-create-card" onSubmit={submitCreateRequest}>
            <div className="service-create-card__grid">
              <label>
                <span>{t('service_request_venue_search')}</span>
                <input
                  type="search"
                  value={createForm.venueSearch}
                  placeholder={t('service_request_venue_search_placeholder')}
                  onChange={(event) => setCreateForm((prev) => ({
                    ...prev,
                    venueSearch: event.target.value,
                    clientId: '',
                    locationId: '',
                  }))}
                />
              </label>
              <label>
                <span>{t('request_mode')}</span>
                <select value={createForm.serviceMode} onChange={(event) => setCreateForm((prev) => ({ ...prev, serviceMode: event.target.value }))}>
                  <option value="remote">{t('request_mode_remote')}</option>
                  <option value="visit">{t('request_mode_visit')}</option>
                </select>
              </label>
              <label>
                <span>{t('urgency')}</span>
                <select value={createForm.urgency} onChange={(event) => setCreateForm((prev) => ({ ...prev, urgency: event.target.value }))}>
                  <option value="low">{t('urgency_low')}</option>
                  <option value="normal">{t('urgency_normal')}</option>
                  <option value="high">{t('urgency_high')}</option>
                  <option value="critical">{t('urgency_critical')}</option>
                </select>
              </label>
              <label>
                <span>{t('request_problem_type')}</span>
                <select value={createForm.category} onChange={(event) => setCreateForm((prev) => ({ ...prev, category: event.target.value }))}>
                  <option value="coffee_machine">{t('cat_coffee_machine')}</option>
                  <option value="grinder">{t('cat_grinder')}</option>
                  <option value="water">{t('cat_water')}</option>
                </select>
              </label>
              {canAssign ? (
                <label>
                  <span>{t('assign_engineer')}</span>
                  <select value={createForm.assignedToUserId} onChange={(event) => setCreateForm((prev) => ({ ...prev, assignedToUserId: event.target.value }))}>
                    <option value="">{t('later')}</option>
                    {engineers.filter((eng) => eng.isActive).map((eng) => <option key={eng.id} value={eng.id}>{eng.fullName}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="checkbox service-form__checkbox">
                <input
                  type="checkbox"
                  checked={createForm.canOperateNow}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, canOperateNow: event.target.checked }))}
                />
                <span>{t('can_operate_now')}</span>
              </label>
            </div>
            {filteredVenueOptions.length ? (
              <div className="quick-filter-row quick-filter-row--compact quick-filter-row--scrollable service-create-card__suggestions">
                {filteredVenueOptions.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={createForm.clientId === item.clientId && createForm.locationId === item.locationId ? 'active' : ''}
                    onClick={() => setCreateForm((prev) => ({
                      ...prev,
                      clientId: item.clientId,
                      locationId: item.locationId,
                      venueSearch: item.label,
                      companyName: item.companyName,
                      locationName: item.locationName,
                    }))}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="service-create-card__grid">
              <label>
                <span>{t('client')}</span>
                <input
                  type="text"
                  value={createForm.companyName}
                  placeholder={t('service_request_company_placeholder')}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, companyName: event.target.value }))}
                />
              </label>
              <label>
                <span>{t('point_not_selected')}</span>
                <input
                  type="text"
                  value={createForm.locationName}
                  placeholder={t('service_request_location_placeholder')}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, locationName: event.target.value }))}
                />
              </label>
              <label>
                <span>{t('contact_back')}</span>
                <input
                  type="text"
                  value={createForm.contactName}
                  placeholder={t('service_request_contact_placeholder')}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, contactName: event.target.value }))}
                />
              </label>
              <label>
                <span>{t('call_client')}</span>
                <input
                  type="tel"
                  value={createForm.phone}
                  placeholder={t('service_request_phone_placeholder')}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </label>
            </div>
            <label>
              <span>{t('problem_description')}</span>
              <textarea
                rows={4}
                value={createForm.description}
                placeholder={t('service_create_placeholder')}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>
            <div className="service-create-card__media">
              <label>
                <span>{t('upload_media')}</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={(event) => setCreateMediaFiles(Array.from(event.target.files || []))}
                />
              </label>
              {createMediaFiles.length ? (
                <ul className="detail-list">
                  {createMediaFiles.map((file, index) => (
                    <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="detail-list__item">
                      <p><strong>{file.name}</strong></p>
                      <small>{String(file.type || '').startsWith('video/') ? t('video') : t('photo')} · {formatFileSize(file.size)}</small>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => setCreateMediaFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index))}
                      >
                        {t('remove')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <ActionRail compact>
              <ActionRailButton tone="brand" disabled={actionLoading === 'create-request'} onClick={submitCreateRequest}>
                {actionLoading === 'create-request' ? t('saving') : t('create_service_request')}
              </ActionRailButton>
            </ActionRail>
          </form>
        ) : null}
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {feedback ? <p>{feedback}</p> : null}

      {!detailRouteMode ? (
        <section className="equipment-ops-board-page">
          <div className="equipment-board-toolbar-shell">
            <div className="equipment-list-search">
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t('service_search_placeholder')}
              />
            </div>
            <ServiceModeFilters value={modeFilter} onChange={setModeFilter} t={t} />
            <ServiceBoardToolbar boardNavItems={boardNavItems} onBoardNav={scrollToBoardColumn} t={t} />
          </div>
          <div className="equipment-ops-list equipment-ops-list--full equipment-board-shell">
            <div ref={boardRef} className="service-board service-board--full">
              {roleProfile.service.showSummary ? (
                <div ref={(node) => { boardColumnRefs.current.summary = node; }} className="equipment-board-column-anchor">
                  <ServiceSummaryColumn dashboard={dashboard} t={t} />
                </div>
              ) : null}
              {loading ? <p>{t('loading')}</p> : null}
              {boardColumns.map((column) => (
                <section
                  key={column.status}
                  ref={(node) => { boardColumnRefs.current[column.status] = node; }}
                  className="service-board-column-trello"
                  data-accent={columnTheme[column.status]?.accent || 'blue'}
                >
                  <header className="service-board-column-trello__header">
                    <div>
                      <small>{columnTheme[column.status]?.eyebrow || t('column')}</small>
                      <h4>{column.label}</h4>
                    </div>
                    <strong>{column.items.length}</strong>
                  </header>
                  <div className="service-board-column-trello__list">
                    {column.items.map((request) => (
                      <ServiceTicketCard
                        key={request.id}
                        request={request}
                        active={requestId === request.id}
                        user={user}
                        actionLoading={actionLoading}
                        boardLabels={boardLabels}
                        t={t}
                        locale={locale}
                        onSelect={selectRequest}
                        onAction={(action) => runAction(action, request)}
                      />
                    ))}
                    {!column.items.length ? <p className="empty-copy">{t('queue_empty')}</p> : null}
                  </div>
                </section>
              ))}
            </div>
            {!filteredRequests.length ? <p className="empty-copy">{t('no_requests_for_search')}</p> : null}
          </div>
        </section>
      ) : (
        <section className="equipment-ops-detail-page">
          <article className="equipment-ops-detail equipment-ops-detail--page">
            <button type="button" className="equipment-back-button" onClick={closeDetail}>{t('back_to_board')}</button>
            {!selectedRequest ? <p>{t('choose_request')}</p> : (
            <>
              {(() => {
                const requestMode = getRequestMode(selectedRequest, t);
                const contactPhone = selectedRequest.pointUser?.phone || selectedRequest.client?.phone || '';
                const telegramUserId = selectedRequest.pointUser?.telegramUserId || selectedRequest.client?.telegramUserId || '';
                return (
                  <>
              <header className="equipment-ops-detail__hero">
                <div className="equipment-ops-detail__hero-copy">
                  <small>Service request</small>
                  <h3>{t('request_card_title')} #{selectedRequest.id}</h3>
                  <p>{selectedRequest.client?.companyName || selectedRequest.pointUser?.fullName || t('client')} · {selectedRequest.location?.name || selectedRequest.equipment?.locationName || t('point_not_selected')}</p>
                  <div className="equipment-ops-detail__hero-statuses">
                    <StatusBadge status={selectedRequest.status}>{boardLabels[selectedRequest.status] || selectedRequest.status}</StatusBadge>
                    <StatusBadge status={selectedRequest.urgency || 'normal'}>{getUrgencyLabel(selectedRequest.urgency, t)}</StatusBadge>
                    <StatusBadge status={requestMode.key}>{requestMode.label}</StatusBadge>
                  </div>
                </div>
                <div className="equipment-ops-detail__hero-preview">
                  {getRequestMediaVisualUrl(getRequestPreview(selectedRequest))
                    ? (
                      isRequestMediaVideo(getRequestPreview(selectedRequest))
                        ? <video className="ticket-preview" src={getRequestPreview(selectedRequest)?.fileUrl || getRequestMediaVisualUrl(getRequestPreview(selectedRequest))} muted playsInline preload="metadata" />
                        : <img className="ticket-preview" src={getRequestMediaVisualUrl(getRequestPreview(selectedRequest))} alt={selectedRequest.equipment?.model || 'preview'} loading="lazy" />
                    )
                    : <div className="service-board-card__preview-empty"><Icon name="equipment" /><span>{t('no_photo')}</span></div>}
                </div>
              </header>

              <ActionRail className="equipment-ops-detail__hero-actions">
                <ActionRailButton tone="brand" onClick={() => setActiveTab('overview')}>{t('overview')}</ActionRailButton>
                <ActionRailButton onClick={() => setActiveTab('media')}>{t('photos_video')}</ActionRailButton>
                <ActionRailButton onClick={() => setActiveTab('history')}>{t('history')}</ActionRailButton>
                <ActionRailButton onClick={() => setActiveTab('notes')}>{t('notes')}</ActionRailButton>
                {contactPhone ? <a className="action-rail__button" href={`tel:${contactPhone}`}>{t('call_client')}</a> : null}
                {telegramUserId ? <a className="action-rail__button" href={`tg://user?id=${telegramUserId}`}>{t('open_telegram')}</a> : null}
              </ActionRail>
              <nav className="equipment-tabs">
                {DETAIL_TABS.map((tab) => <button key={tab} type="button" className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tabLabels[tab]}</button>)}
              </nav>

              {activeTab === 'overview' ? (
                <>
                  <section className="detail-section-card">
                      <div className="equipment-detail-grid">
                        <p><Icon name="clients" /> {t('client')}: {selectedRequest.client?.companyName || '—'}</p>
                        <p><Icon name="employees" /> Бариста: {selectedRequest.pointUser?.fullName || '—'}</p>
                        <p><Icon name="clients" /> {t('contact_back')}: {contactPhone || t('no_phone')}</p>
                        <p><Icon name="equipment" /> {t('equipment')}: {selectedRequest.equipment?.brand || '—'} {selectedRequest.equipment?.model || ''}</p>
                        <p><Icon name="equipment" /> Точка: {selectedRequest.location?.name || selectedRequest.equipment?.locationName || '—'}</p>
                        <p><Icon name="service" /> {t('urgency')}: {getUrgencyLabel(selectedRequest.urgency, t)}</p>
                        <p><Icon name="service" /> {t('request_mode')}: {requestMode.label}</p>
                        <p><Icon name="dashboard" /> {t('assigned')}: {selectedRequest.assignedToUser?.fullName || t('not_assigned')}</p>
                        <p><Icon name="content" /> {t('can_operate_now')}: {selectedRequest.canOperateNow ? t('yes') : t('no')}</p>
                        <p><Icon name="clients" /> {t('service_updated')}: {formatDate(selectedRequest.updatedAt, locale)}</p>
                      </div>
                  </section>

                  <div className="detail-section-card">
                    <h4>{t('problem_description')}</h4>
                    <p>{selectedRequest.description || t('no_description')}</p>
                  </div>

                  {canAssign ? (
                    <div className="detail-section-card">
                      <h4>{selectedRequest.assignedToUserId ? t('reassign_engineer') : t('assign_engineer')}</h4>
                      <select value={assignForm.assignedToUserId} onChange={(e) => setAssignForm({ assignedToUserId: e.target.value })}>
                        <option value="">{t('choose_engineer')}</option>
                        {engineers.filter((eng) => eng.isActive).map((eng) => <option key={eng.id} value={eng.id}>{eng.fullName}</option>)}
                      </select>
                      <ActionRail compact>
                        <ActionRailButton tone="brand" disabled={Boolean(actionLoading)} onClick={submitAssignment}>{actionLoading === 'assign' ? t('saving') : t('save_assignment')}</ActionRailButton>
                      </ActionRail>
                    </div>
                  ) : null}

                  <div className="detail-section-card">
                    <h4>{t('quick_actions')}</h4>
                    <ActionRail>
                      {canDelete ? (
                        <ActionRailButton tone="danger" disabled={Boolean(actionLoading)} onClick={() => runAction({ kind: 'delete', label: t('delete_service_request_card') })}>
                          {t('delete_service_request_card')}
                        </ActionRailButton>
                      ) : null}
                      {getRoleActions(selectedRequest, user, t).map((action) => (
                        <ActionRailButton key={`${action.kind}-${action.status || action.label}`} tone={action.kind === 'claim' ? 'brand' : 'default'} disabled={Boolean(actionLoading)} onClick={() => runAction(action)}>
                          {action.label}
                        </ActionRailButton>
                      ))}
                      {!getRoleActions(selectedRequest, user, t).length ? <p className="empty-copy">{t('no_role_actions')}</p> : null}
                    </ActionRail>
                  </div>
                </>
              ) : null}

              {activeTab === 'history' ? (
                <div className="timeline-list">
                  {[...(selectedRequest.history || [])].map((item) => (
                    <article key={item.id} className="timeline-item">
                      <i />
                      <div>
                        <strong>{boardLabels[item.previousStatus] || item.previousStatus} → {boardLabels[item.nextStatus] || item.nextStatus}</strong>
                        <p>{item.comment || t('no_comment')}</p>
                        <small>{formatDate(item.createdAt, locale)}</small>
                      </div>
                    </article>
                  ))}
                  {assignmentHistory.map((item) => (
                    <article key={item.id} className="timeline-item">
                      <i />
                      <div>
                        <strong>{t('assignment')}: {item.toUser?.fullName || item.toUserId}</strong>
                        <p>{item.comment || t('no_comment')}</p>
                        <small>{formatDate(item.createdAt, locale)} · {item.assignedByUser?.fullName || t('system_user')}</small>
                      </div>
                    </article>
                  ))}
                  {!selectedRequest.history?.length && !assignmentHistory.length ? <p className="empty-copy">{t('history_empty')}</p> : null}
                </div>
              ) : null}

              {activeTab === 'media' ? (
                <div className="media-tab">
                  <div className="detail-section-card">
                    <h4>{t('photos_before')}</h4>
                    <div className="media-grid">
                      {mediaGroups.before.map((item) => (
                        <article key={item.id} className="media-card">
                          <button type="button" className="media-card__preview" onClick={() => openRequestMedia(item)}>
                            {isRequestMediaVideo(item) ? <video src={item.fileUrl} controls preload="metadata" onClick={(event) => event.stopPropagation()} /> : <img src={getRequestMediaVisualUrl(item)} alt={item.originalName || 'before'} />}
                          </button>
                          <small>{item.originalName || t('photo_before_fallback')}</small>
                        </article>
                      ))}
                      {!mediaGroups.before.length ? <p className="empty-copy media-empty">{t('no_before_photos')}</p> : null}
                    </div>
                  </div>

                  <div className="detail-section-card">
                    <h4>{t('photos_after')}</h4>
                    <div className="media-grid">
                      {mediaGroups.after.map((item) => (
                        <article key={item.id} className="media-card">
                          <button type="button" className="media-card__preview" onClick={() => openRequestMedia(item)}>
                            {isRequestMediaVideo(item) ? <video src={item.fileUrl} controls preload="metadata" onClick={(event) => event.stopPropagation()} /> : <img src={getRequestMediaVisualUrl(item)} alt={item.originalName || 'after'} />}
                          </button>
                          <small>{item.originalName || t('photo_after_fallback')}</small>
                        </article>
                      ))}
                      {!mediaGroups.after.length ? <p className="empty-copy media-empty">{t('no_after_photos')}</p> : null}
                    </div>
                  </div>

                  <div className="detail-section-card">
                    <h4>{t('client_media')}</h4>
                    <div className="media-grid">
                      {mediaGroups.client.map((item) => (
                        <article key={item.id} className="media-card">
                          <button type="button" className="media-card__preview" onClick={() => openRequestMedia(item)}>
                            {isRequestMediaVideo(item) ? <video src={item.fileUrl} controls preload="metadata" onClick={(event) => event.stopPropagation()} /> : <img src={getRequestMediaVisualUrl(item)} alt={item.originalName || 'client'} />}
                          </button>
                          <small>{item.originalName || t('client_media_fallback')}</small>
                        </article>
                      ))}
                      {!mediaGroups.client.length ? <p className="empty-copy media-empty">{t('no_client_media')}</p> : null}
                    </div>
                  </div>

                  <div className="detail-section-card">
                    <h4>{t('upload_media')}</h4>
                    <select value={mediaStage} onChange={(e) => setMediaStage(e.target.value)}>
                      <option value="before">{t('photos_before')}</option>
                      <option value="after">{t('photos_after')}</option>
                    </select>
                    <input type="file" multiple accept="image/*,video/*" onChange={(e) => setMediaFiles(Array.from(e.target.files || []))} />
                    {mediaFiles.length ? (
                      <ul className="detail-list">
                        {mediaFiles.map((file) => (
                          <li key={`${file.name}-${file.size}-${file.lastModified}`} className="detail-list__item">
                            <p><strong>{file.name}</strong></p>
                            <small>{String(file.type || '').startsWith('video/') ? t('video') : t('photo')} · {formatFileSize(file.size)}</small>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <ActionRail compact>
                      <ActionRailButton tone="brand" disabled={Boolean(actionLoading) || !mediaFiles.length} onClick={submitMedia}>{actionLoading === 'media' ? t('loading') : t('upload')}</ActionRailButton>
                    </ActionRail>
                  </div>
                </div>
              ) : null}

              {activeTab === 'notes' ? (
                <div className="notes-tab">
                  <div className="assignment-history">
                    {(selectedRequest.notes || []).map((note) => (
                      <article key={note.id} className="note-item">
                        <strong>{note.authorRole || t('system_user')}</strong>
                        <p>{note.text}</p>
                        <small>{formatDate(note.createdAt, locale)}</small>
                      </article>
                    ))}
                    {!(selectedRequest.notes || []).length ? <p className="empty-copy">{t('notes_empty')}</p> : null}
                  </div>
                  {canSeeInternalNotes ? (
                    <div className="detail-section-card note-composer">
                      <h4>{t('add_internal_note')}</h4>
                      <textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} rows={3} placeholder={t('internal_note_placeholder')} />
                      <ActionRail compact>
                        <ActionRailButton tone="brand" disabled={Boolean(actionLoading)} onClick={submitNote}>{actionLoading === 'note' ? t('saving') : t('save_note')}</ActionRailButton>
                      </ActionRail>
                    </div>
                  ) : null}
                </div>
              ) : null}
                  </>
                );
              })()}
            </>
          )}
          </article>
        </section>
      )}
      <RequestMediaLightbox
        rows={selectedRequestMedia}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(-1)}
        onNavigate={(delta) => setLightboxIndex((prev) => Math.min(Math.max(prev + delta, 0), selectedRequestMedia.length - 1))}
        t={t}
        locale={locale}
      />
    </section>
  );
}
