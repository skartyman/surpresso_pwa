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
  return error?.message || t('err_request_failed');
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
  const [mediaFiles, setMediaFiles] = useState([]);
  const mountedRef = useRef(true);
  const [form, setForm] = useState({
    equipmentId: searchParams.get('equipmentId') || '',
    category: 'coffee_machine',
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
      setEquipment(Array.isArray(equipmentData?.items) ? equipmentData.items : []);
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

  useEffect(() => {
    const preselectedId = searchParams.get('equipmentId') || '';
    if (preselectedId) {
      setForm((prev) => ({ ...prev, equipmentId: prev.equipmentId || preselectedId }));
    }
  }, [searchParams]);

  const selectedEquipment = useMemo(
    () => equipment.find((item) => item.id === form.equipmentId) || null,
    [equipment, form.equipmentId],
  );

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

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccessId('');
    setIsSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('type', 'service_repair');
      payload.append('equipmentId', form.equipmentId);
      payload.append('category', form.category);
      payload.append('description', form.description.trim());
      payload.append('urgency', form.urgency);
      payload.append('canOperateNow', String(form.canOperateNow));
      mediaFiles.forEach((file) => payload.append('media', file));
      const created = await telegramClientApi.createServiceRequest(payload);
      setSuccessId(created.id);
      setMediaFiles([]);
      setForm((prev) => ({ ...prev, description: '' }));
    } catch (submitError) {
      setError(getUploadErrorMessage(submitError, t));
    } finally {
      setIsSubmitting(false);
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
          <label className="service-field-label">{t('request_pick_equipment')}</label>
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
        </div>

        <div className="service-form__grid">
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
          <label className="service-field-label">{t('request_attach_media')}</label>
          <input type="file" multiple accept="image/*,video/*" onChange={(e) => setMediaFiles(Array.from(e.target.files || []))} />
          <small>{t('request_media_hint')}</small>
          {mediaFiles.length ? <small>{t('request_selected')}: {mediaFiles.length}</small> : null}
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
        </div>

        <button type="submit" disabled={isSubmitting || !form.equipmentId}>{isSubmitting ? t('sending') : t('send_request')}</button>

        {successId ? <p className="notice notice-success">{t('sent_ok')} {t('request_id_label')}: {successId}</p> : null}
        {error ? <p className="notice notice-error">{error}</p> : null}
      </form>
    </section>
  );
}
