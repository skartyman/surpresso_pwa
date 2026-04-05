import { BottomNav } from '../components/BottomNav';
import { useI18n } from '../i18n';

export function AppShell({ children }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="app-shell"> 
      <div className="top-controls"> 
        <button
          type="button"
          className="language-toggle secondary"
          onClick={() => setLocale(locale === 'uk' ? 'ru' : 'uk')}
        >
          {t('lang_switch')}: {locale.toUpperCase()}
        </button>
      </div>
      <main className="page">{children}</main>
      <BottomNav />
    </div>
  );
}
