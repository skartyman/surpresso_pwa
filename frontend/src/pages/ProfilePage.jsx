import { useEffect, useState } from 'react';
import { telegramClientApi } from '../api/telegramClientApi';
import { useI18n } from '../i18n';

export function ProfilePage() {
  const { t } = useI18n();
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    telegramClientApi.me().then(setProfile);
  }, []);

  if (!profile) return <p>{t('loading')}</p>;

  return (
    <section className="status-card">
      <h2>{t('nav_profile')}</h2>
      <p>{t('profile_company')}: {profile.client?.companyName || '—'}</p>
      <p>{t('profile_client_id')}: {profile.client?.id || '—'}</p>
      <p>{t('profile_telegram')}: {profile.telegramUser?.username || profile.telegramUser?.id || '—'}</p>
    </section>
  );
}
