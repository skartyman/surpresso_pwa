import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useParams } from 'react-router-dom';
import { telegramClientApi } from '../api/telegramClientApi';
import { useI18n } from '../i18n';

const humanStatus = {
  new: 'status_new',
  in_progress: 'in_progress',
  waiting_client: 'status_waiting_client',
  resolved: 'status_resolved',
  cancelled: 'status_cancelled',
};

const humanCategory = {
  coffee_machine: 'cat_coffee_machine',
  grinder: 'cat_grinder',
  water: 'cat_water',
};

const humanType = {
  service_repair: 'type_service_repair',
  coffee_order: 'type_coffee_order',
  coffee_tasting: 'type_coffee_tasting',
  grinder_check: 'type_grinder_check',
  rental_auto: 'type_rental_auto',
  rental_pro: 'type_rental_pro',
  feedback: 'type_feedback',
};

const REQUEST_TYPE_CONFIG = {
  service_repair: { title: 'type_service_repair', serviceFlow: true },
  coffee_order: { title: 'type_coffee_order', serviceFlow: false },
  coffee_tasting: { title: 'type_coffee_tasting', serviceFlow: false },
  grinder_check: { title: 'type_grinder_check', serviceFlow: false },
  rental_auto: { title: 'type_rental_auto', serviceFlow: false },
  rental_pro: { title: 'type_rental_pro', serviceFlow: false },
  feedback: { title: 'type_feedback', serviceFlow: false },
};

const errorLabels = {
  category_required: 'err_category_required',
  description_required: 'err_description_required',
  urgency_required: 'err_urgency_required',
  equipment_not_found: 'err_equipment_not_found',
  equipment_client_mismatch: 'err_equipment_client_mismatch',
  service_unavailable: 'err_service_unavailable',
  Invalid: 'err_invalid',
  request_failed: 'err_request_failed',
};

const formatError = (error, t) => {
  const message = String(error?.message || '').trim();
  if (!message) return t('err_request_failed_late');

  const known = Object.entries(errorLabels).find(([code]) => message.includes(code));
  return known ? t(known[1]) : message;
};

export function ServicePage() {
  const { requestType } = useParams();
  const { t, dateLocale } = useI18n();
  const activeType = REQUEST_TYPE_CONFIG[requestType] ? requestType : 'service_repair';
  const isServiceFlow = REQUEST_TYPE_CONFIG[activeType]?.serviceFlow;
  const pageTitle = t(REQUEST_TYPE_CONFIG[activeType]?.title || 'generic_request');

  const [equipment, setEquipment] = useState([]);
  const [history, setHistory] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [error, setError] = useState('');
  const [successRequest, setSuccessRequest] = useState(null);

  const [form, setForm] = useState({
    equipmentId: '',
    title: '',
    category: '',
    description: '',
    urgency: 'normal',
    canOperateNow: true,
    media: [],
  });

  const loadHistory = useCallback(async () => {
    const data = await telegramClientApi.listServiceRequests();
    setHistory(Array.isArray(data?.items) ? data.items : []);
  }, []);

  useEffect(() => {
    let active = true;

    Promise.all([
      telegramClientApi.listEquipment().catch(() => []),
      loadHistory().catch(() => {
        if (active) {
          setError(t('history_load_error'));
        }
      }),
    ]).then(([equipmentItems]) => {
      if (!active) return;
      setEquipment(Array.isArray(equipmentItems?.items) ? equipmentItems.items : equipmentItems || []);
      setIsLoadingHistory(false);
    });

    return () => {
      active = false;
    };
  }, [loadHistory]);

  const selectedEquipment = useMemo(
    () => equipment.find((item) => item.id === form.equipmentId) || null,
    [equipment, form.equipmentId],
  );
  const hasEquipment = equipment.length > 0;

  const onSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError('');
    setSuccessRequest(null);
    setIsSubmitting(true);

    try {
      const payload = new FormData();

      if (form.equipmentId) {
        payload.append('equipmentId', form.equipmentId);
      }

      payload.append('type', activeType);
      payload.append('title', form.title.trim() || pageTitle);
      payload.append('category', form.category);
      payload.append('description', form.description.trim());
      payload.append('urgency', form.urgency);
      payload.append('canOperateNow', String(form.canOperateNow));

      form.media.forEach((file) => {
        payload.append('media', file);
      });

      const created = await telegramClientApi.createServiceRequest(payload);
      setSuccessRequest(created);

      setForm((prev) => ({ ...prev, title: '', category: '', description: '', media: [] }));
      await loadHistory();
    } catch (submitError) {
      setError(formatError(submitError, t));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="service-page">
      <header className="hero service-hero">
        <h1>{t('service')}</h1>
        <p>{pageTitle}. {t('service_intro')}</p>
      </header>

      <div className="service-panel">
        <h2>{t('service_new')}</h2>

        {error ? <div className="notice notice-error">{error}</div> : null}
        {successRequest ? (
          <div className="notice notice-success">
            <strong>{t('sent_ok')}</strong>
            <p>ID: {successRequest.id}</p>
            <Link to={`/service/${successRequest.id}`}>{t('go_status')}</Link>
          </div>
        ) : null}

        <form className="service-form" onSubmit={onSubmit}>
          {isServiceFlow && !hasEquipment ? (
            <div className="notice service-empty-equipment">
              <p><strong>{t('no_equipment')}</strong></p>
              <p>{t('can_submit_anyway')}</p>
            </div>
          ) : null}

          {isServiceFlow ? (
            <>
              <label className="service-field-label" htmlFor="service-equipment-select">{t('equipment_optional')}</label>
              <select
                id="service-equipment-select"
                value={form.equipmentId}
                aria-label={t('equipment_optional')}
                onChange={(event) => setForm((prev) => ({ ...prev, equipmentId: event.target.value }))}
                disabled={isSubmitting}
              >
                <option value="">{t('equipment_skip')}</option>
                {equipment.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.brand} {item.model} ({item.internalNumber || item.id})
                  </option>
                ))}
              </select>

              <select
                value={form.category}
                aria-label={t('problem_category')}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                disabled={isSubmitting}
                required
              >
                <option value="" disabled>{t('problem_category')}</option>
                <option value="coffee_machine">{t('cat_coffee_machine')}</option>
                <option value="grinder">{t('cat_grinder')}</option>
                <option value="water">{t('cat_water')}</option>
              </select>
            </>
          ) : null}

          {!isServiceFlow ? (
            <input
              value={form.title}
              aria-label={t('topic')}
              placeholder={t('topic_short')}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              disabled={isSubmitting}
              required
            />
          ) : null}

          <textarea
            placeholder={t('problem_desc')}
            aria-label={t('problem_desc')}
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            required
            disabled={isSubmitting}
          />

          {isServiceFlow ? (
            <select
              value={form.urgency}
              aria-label={t('request_priority')}
              onChange={(event) => setForm((prev) => ({ ...prev, urgency: event.target.value }))}
              disabled={isSubmitting}
            >
              <option value="low">{t('low')}</option>
              <option value="normal">{t('normal')}</option>
              <option value="high">{t('high')}</option>
              <option value="critical">{t('critical')}</option>
            </select>
          ) : null}

          {isServiceFlow ? (
            <label className="checkbox service-checkbox-card">
              <input
                type="checkbox"
                checked={form.canOperateNow}
                onChange={(event) => setForm((prev) => ({ ...prev, canOperateNow: event.target.checked }))}
                disabled={isSubmitting}
              />
              <span>{t('can_operate')}</span>
            </label>
          ) : null}

          <label className="upload-block" htmlFor="service-attachments">
            <span className="upload-block__title">{t('photo_video')}</span>
            <span className="upload-block__text">{t('upload_hint')}</span>
            <input
              id="service-attachments"
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(event) => setForm((prev) => ({ ...prev, media: Array.from(event.target.files || []) }))}
              disabled={isSubmitting}
            />
            {form.media.length ? <small>{t('files_selected')}: {form.media.length}</small> : null}
          </label>

          <button type="submit" className="service-submit-btn" disabled={isSubmitting}>
            {isSubmitting ? t('sending') : t('send_request')}
          </button>
        </form>

        {isServiceFlow && selectedEquipment ? (
          <p className="service-hint">{t('selected_equipment')}: {selectedEquipment.brand} {selectedEquipment.model}</p>
        ) : null}
      </div>

      <section className="service-history">
        <h2>{t('requests_history')}</h2>
        {isLoadingHistory ? <p>{t('loading')}</p> : null}
        <div className="list">
          {history.map((request) => (
            <Link key={request.id} className="list-item" to={`/service/${request.id}`}>
              <strong>{request.id}</strong>
              <p>{t(humanType[request.type] || humanCategory[request.category] || request.category)}</p>
              <small>
                {t('status')}: {t(humanStatus[request.status] || request.status)} · {new Date(request.createdAt).toLocaleString(dateLocale)}
              </small>
            </Link>
          ))}
          {!history.length && !isLoadingHistory ? <p>{t('no_requests')}</p> : null}
        </div>
      </section>
    </section>
  );
}
