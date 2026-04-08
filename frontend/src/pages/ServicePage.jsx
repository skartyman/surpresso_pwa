import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { telegramClientApi } from '../api/telegramClientApi';
import { ClientPointOnboarding } from '../components/ClientPointOnboarding';
import { useI18n } from '../i18n';

function formatFileSize(size = 0) {
  const value = Number(size || 0);
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function getUploadErrorMessage(error, t) {
  const code = String(error?.message || '').trim();
  if (code === 'unsupported_media_type') return t('request_media_invalid_type');
  if (code === 'media_file_too_large') return t('request_media_too_large');
  if (code === 'too_many_media_files') return t('request_media_too_many');
  if (code === 'description_required') return t('request_description_required');
  return error?.message || t('err_request_failed');
}

function createMediaEntry(file) {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2, 8)}`,
    file,
    previewUrl: String(file.type || '').startsWith('image/') || String(file.type || '').startsWith('video/')
      ? URL.createObjectURL(file)
      : '',
  };
}

export function ServicePage() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const [equipment, setEquipment] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [successId, setSuccessId] = useState('');
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [mediaFiles, setMediaFiles] = useState([]);
  const mountedRef = useRef(true);
  const [form, setForm] = useState({
    equipmentId: searchParams.get('equipmentId') || '',
    category: 'coffee_machine',
    serviceMode: 'remote',
    description: '',
    urgency: 'normal',
    canOperateNow: true,
  });

  const loadContext = useCallback(async () => {
    setLoading(true);
    try {
      const [equipmentData, meData] = await Promise.all([
        telegramClientApi.listEquipment(),
        telegramClientApi.me(),
      ]);
      if (!mountedRef.current) return;
      const nextEquipment = Array.isArray(equipmentData?.items) ? equipmentData.items : [];
      setEquipment(nextEquipment);
      setProfile(meData?.profile || null);
    } catch (loadError) {
      if (!mountedRef.current) return;
      setError(loadError?.message || t('tg_auth_unavailable'));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    mountedRef.current = true;
    loadContext();
    return () => {
      mountedRef.current = false;
    };
  }, [loadContext]);

  useEffect(() => () => {
    mediaFiles.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  }, [mediaFiles]);

  useEffect(() => {
    const preselectedId = searchParams.get('equipmentId') || '';
    if (preselectedId) {
      setForm((prev) => ({ ...prev, equipmentId: prev.equipmentId || preselectedId }));
    }
  }, [searchParams]);

  useEffect(() => {
    if (!equipment.length) return;
    setForm((prev) => {
      if (prev.equipmentId && equipment.some((item) => item.id === prev.equipmentId)) {
        return prev;
      }
      return { ...prev, equipmentId: equipment[0]?.id || '' };
    });
  }, [equipment]);

  const selectedEquipment = useMemo(
    () => equipment.find((item) => item.id === form.equipmentId) || null,
    [equipment, form.equipmentId],
  );

  const formValidationError = useMemo(() => {
    if (!form.description.trim()) return t('request_description_required');
    return '';
  }, [form.description, t]);

  const handleRegisterProfile = useCallback(async (payload) => {
    setIsSavingProfile(true);
    setError('');
    try {
      const data = await telegramClientApi.registerProfile(payload);
      if (!mountedRef.current) return;
      setProfile(data?.profile || null);
      const equipmentData = await telegramClientApi.listEquipment();
      if (!mountedRef.current) return;
      setEquipment(Array.isArray(equipmentData?.items) ? equipmentData.items : []);
    } catch (saveError) {
      if (!mountedRef.current) return;
      setError(saveError?.message || t('tg_auth_unavailable'));
    } finally {
      if (mountedRef.current) {
        setIsSavingProfile(false);
      }
    }
  }, [t]);

  const appendFiles = useCallback((fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setMediaFiles((prev) => [...prev, ...files.map(createMediaEntry)].slice(0, 6));
  }, []);

  const handleFileSelect = useCallback((event) => {
    appendFiles(event.target.files);
    event.target.value = '';
  }, [appendFiles]);

  const removeMedia = useCallback((id) => {
    setMediaFiles((prev) => {
      const next = [];
      prev.forEach((item) => {
        if (item.id === id) {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
          return;
        }
        next.push(item);
      });
      return next;
    });
  }, []);

  const clearMedia = useCallback(() => {
    setMediaFiles((prev) => {
      prev.forEach((item) => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (formValidationError) {
      setError(formValidationError);
      return;
    }
    setError('');
    setSuccessId('');
    setUploadProgress(0);
    setIsSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('type', form.serviceMode === 'visit' ? 'service_repair_visit' : 'service_repair_remote');
      if (form.equipmentId) payload.append('equipmentId', form.equipmentId);
      payload.append('category', form.category);
      payload.append('description', form.description.trim());
      payload.append('urgency', form.urgency);
      payload.append('canOperateNow', String(form.canOperateNow));
      mediaFiles.forEach((item) => payload.append('media', item.file));
      const created = await telegramClientApi.createServiceRequest(payload, {
        onProgress: (value) => {
          if (!mountedRef.current) return;
          setUploadProgress(value);
        },
      });
      if (!mountedRef.current) return;
      setSuccessId(created.id);
      clearMedia();
      setForm((prev) => ({ ...prev, description: '' }));
      setUploadProgress(100);
    } catch (submitError) {
      if (!mountedRef.current) return;
      setError(getUploadErrorMessage(submitError, t));
      setUploadProgress(0);
    } finally {
      if (mountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  if (loading) {
    return <p>{t('loading')}</p>;
  }

  if (!profile?.onboardingComplete) {
    return (
      <section className="service-page client-page">
        <header className="hero hero--service-form">
          <div className="hero__copy">
            <small>{t('new_request_card')}</small>
            <h2>{t('service_new')}</h2>
            <p>{t('onboarding_required')}</p>
          </div>
        </header>

        <ClientPointOnboarding
          profile={profile}
          submitting={isSavingProfile}
          onSubmit={handleRegisterProfile}
        />

        {error ? <p className="notice notice-error">{error}</p> : null}
      </section>
    );
  }

  return (
    <section className="service-page client-page">
      <header className="hero hero--service-form">
        <div className="hero__copy">
          <small>{t('new_request_card')}</small>
          <h2>{t('service_new')}</h2>
          <p>{t('service_intro')}</p>
        </div>
        <div className="service-form__overview">
          <span>{profile?.location?.name || t('request_pick_equipment')}</span>
          <strong>{selectedEquipment ? `${selectedEquipment.brand} ${selectedEquipment.model}` : t('equipment_skip')}</strong>
          <em>{selectedEquipment?.locationName || selectedEquipment?.clientLocation || selectedEquipment?.address || profile?.network?.name || t('request_no_equipment_hint')}</em>
        </div>
      </header>

      <form className="service-panel service-form service-form--rich" onSubmit={submit}>
        <div className="service-form__equipment-picker">
          <div className="service-form__section-head">
            <label className="service-field-label">{t('request_pick_equipment')}</label>
            <small>{t('request_equipment_optional')}</small>
          </div>
          {equipment.length ? (
            <div className="service-form__equipment-grid">
              {equipment.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`service-equipment-option ${form.equipmentId === item.id ? 'active' : ''}`}
                  onClick={() => setForm((prev) => ({ ...prev, equipmentId: item.id }))}
                >
                  <strong>{item.brand} {item.model}</strong>
                  <span>{item.locationName || item.clientLocation || item.address || item.serialNumber || item.id}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="notice notice-error">{t('request_equipment_missing')}</p>
          )}
        </div>

        <div className="service-form__grid service-form__grid--triple">
          <label>
            <span className="service-field-label">{t('request_problem_type')}</span>
            <select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}>
              <option value="coffee_machine">{t('cat_coffee_machine')}</option>
              <option value="grinder">{t('cat_grinder')}</option>
              <option value="water">{t('cat_water')}</option>
            </select>
          </label>

          <label>
            <span className="service-field-label">{t('request_priority')}</span>
            <select value={form.urgency} onChange={(e) => setForm((prev) => ({ ...prev, urgency: e.target.value }))}>
              <option value="low">{t('low')}</option>
              <option value="normal">{t('normal')}</option>
              <option value="high">{t('high')}</option>
              <option value="critical">{t('critical')}</option>
            </select>
          </label>

          <label>
            <span className="service-field-label">{t('request_service_mode')}</span>
            <select value={form.serviceMode} onChange={(e) => setForm((prev) => ({ ...prev, serviceMode: e.target.value }))}>
              <option value="remote">{t('request_service_mode_remote')}</option>
              <option value="visit">{t('request_service_mode_visit')}</option>
            </select>
          </label>
        </div>

        <textarea
          value={form.description}
          required
          placeholder={t('problem_desc')}
          onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
        />

        <label className="checkbox service-form__checkbox">
          <input
            type="checkbox"
            checked={form.canOperateNow}
            onChange={(e) => setForm((prev) => ({ ...prev, canOperateNow: e.target.checked }))}
          />
          <span>{t('request_can_work')}</span>
        </label>

        <div className="service-form__media">
          <div className="service-form__section-head">
            <label className="service-field-label">{t('request_attach_media')}</label>
            {mediaFiles.length ? <small>{t('request_selected')}: {mediaFiles.length}</small> : <small>{t('request_media_hint')}</small>}
          </div>

          <div className="service-form__media-actions">
            <label className="service-media-action service-media-action--picker">
              <span>{t('request_take_photo')}</span>
              <input className="service-media-input" type="file" accept="image/*" capture="environment" onChange={handleFileSelect} />
            </label>
            <label className="service-media-action service-media-action--picker">
              <span>{t('request_take_video')}</span>
              <input className="service-media-input" type="file" accept="video/*" capture="environment" onChange={handleFileSelect} />
            </label>
            <label className="service-media-action service-media-action--picker">
              <span>{t('request_pick_gallery')}</span>
              <input className="service-media-input" type="file" multiple accept="image/*,video/*" onChange={handleFileSelect} />
            </label>
          </div>

          {mediaFiles.length ? (
            <>
              <div className="service-media-preview-grid">
                {mediaFiles.map((item) => (
                  <article key={item.id} className="service-media-preview-card">
                    <div className="service-media-preview-card__visual">
                      {String(item.file.type || '').startsWith('video/') ? (
                        <video src={item.previewUrl} muted playsInline preload="metadata" />
                      ) : (
                        <img src={item.previewUrl} alt={item.file.name} />
                      )}
                      <button type="button" className="service-media-preview-card__remove" onClick={() => removeMedia(item.id)}>
                        {t('remove')}
                      </button>
                    </div>
                    <div className="service-media-preview-card__meta">
                      <strong>{item.file.name}</strong>
                      <small>{String(item.file.type || '').startsWith('video/') ? t('video') : t('photo')} · {formatFileSize(item.file.size)}</small>
                    </div>
                  </article>
                ))}
              </div>
              <button type="button" className="service-media-clear" onClick={clearMedia}>{t('request_clear_media')}</button>
            </>
          ) : null}
        </div>

        {isSubmitting ? (
          <div className="service-upload-progress" aria-live="polite">
            <div className="service-upload-progress__bar">
              <span style={{ width: `${uploadProgress}%` }} />
            </div>
            <small>{t('request_upload_progress')}: {uploadProgress}%</small>
          </div>
        ) : null}

        <button type="submit" disabled={isSubmitting || Boolean(formValidationError)}>{isSubmitting ? t('sending') : t('send_request')}</button>

        {!selectedEquipment ? <p className="notice">{t('request_submit_without_equipment')}</p> : null}
        {formValidationError ? <p className="notice notice-error">{formValidationError}</p> : null}
        {successId ? <p className="notice notice-success">{t('sent_ok')} {t('request_id_label')}: {successId}</p> : null}
        {error ? <p className="notice notice-error">{error}</p> : null}
      </form>
    </section>
  );
}
