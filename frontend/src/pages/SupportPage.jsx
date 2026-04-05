import { useI18n } from '../i18n';

export function SupportPage() {
  const { t } = useI18n();

  return (
    <section>
      <h1>{t('support')}</h1>
      <p>{t('support_subtitle')}</p>
      <button>{t('contact_manager')}</button>
    </section>
  );
}
