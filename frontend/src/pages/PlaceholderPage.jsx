import { useI18n } from '../i18n';

export function PlaceholderPage({ title }) {
  const { t } = useI18n();

  return (
    <section>
      <h1>{title}</h1>
      <p>{t('placeholder_subtitle')}</p>
    </section>
  );
}
