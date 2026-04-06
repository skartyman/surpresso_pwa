import { useCallback, useEffect, useRef, useState } from 'react';
import { telegramClientApi } from '../api/telegramClientApi';
import { useI18n } from '../i18n';

export function ProfilePage() {
  const { t } = useI18n();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  if (loading) return <p>{t('loading')}</p>;

  if (error) {
    return (
      <section className="status-card">
        <h2>{t('nav_profile')}</h2>
        <p className="notice notice-error">{error}</p>
        <button type="button" onClick={loadProfile}>{t('retry')}</button>
      </section>
    );
  }

  return (
    <section className="status-card">
      <h2>{t('nav_profile')}</h2>
      <p>{t('profile_company')}: {profile.client?.companyName || '—'}</p>
      <p>{t('profile_client_id')}: {profile.client?.id || '—'}</p>
      <p>{t('profile_telegram')}: {profile.telegramUser?.username || profile.telegramUser?.id || '—'}</p>
    </section>
  );
}
