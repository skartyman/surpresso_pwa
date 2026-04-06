import { useCallback, useEffect, useRef, useState } from 'react';
import { telegramClientApi } from '../api/telegramClientApi';
import { ClientPointOnboarding } from '../components/ClientPointOnboarding';
import { useI18n } from '../i18n';

export function ProfilePage() {
  const { t } = useI18n();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await telegramClientApi.me();
      if (!mountedRef.current) return;
      setProfile(data);
    } catch (loadError) {
      if (!mountedRef.current) return;
      setProfile(null);
      setError(loadError?.status === 401 ? t('tg_auth_failed') : t('tg_auth_unavailable'));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleRegisterProfile = useCallback(async (payload) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const data = await telegramClientApi.registerProfile(payload);
      if (!mountedRef.current) return;
      setProfile(data);
      setNotice(t('onboarding_success'));
    } catch (saveError) {
      if (!mountedRef.current) return;
      setError(saveError?.message || t('tg_auth_unavailable'));
    } finally {
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }, [t]);

  if (loading) return <p>{t('loading')}</p>;

  if (error && !profile) {
    return (
      <section className="status-card">
        <h2>{t('nav_profile')}</h2>
        <p className="notice notice-error">{error}</p>
        <button type="button" onClick={loadProfile}>{t('retry')}</button>
      </section>
    );
  }

  return (
    <section className="client-profile-card">
      <div className="client-profile-card__hero">
        <div>
          <small>{t('quick_overview')}</small>
          <h2>{t('nav_profile')}</h2>
        </div>
        <span>{profile?.profile?.onboardingComplete ? t('onboarding_ready') : t('profile_status')}</span>
      </div>

      <div className="client-profile-card__grid">
        <p>{t('profile_company')}: {profile?.client?.companyName || '—'}</p>
        <p>{t('profile_client_id')}: {profile?.client?.id || '—'}</p>
        <p>{t('profile_telegram')}: {profile?.telegramUser?.username || profile?.telegramUser?.id || '—'}</p>
        <p>{t('profile_contact')}: {profile?.profile?.pointUser?.fullName || profile?.client?.contactName || '—'}</p>
        <p>{t('profile_network')}: {profile?.profile?.network?.name || '—'}</p>
        <p>{t('profile_location')}: {profile?.profile?.location?.name || '—'}</p>
        <p>{t('profile_role')}: {profile?.profile?.pointUser?.role || '—'}</p>
      </div>

      <ClientPointOnboarding
        profile={profile?.profile}
        submitting={saving}
        onSubmit={handleRegisterProfile}
      />

      {notice ? <p className="notice notice-success">{notice}</p> : null}
      {error ? <p className="notice notice-error">{error}</p> : null}
    </section>
  );
}
