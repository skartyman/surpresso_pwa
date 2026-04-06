import { useCallback, useEffect, useRef, useState } from 'react';
import { telegramAuthErrors, telegramClientApi, getTelegramInitData, getTelegramWebApp } from '../../api/telegramClientApi';
import { useI18n } from '../../i18n';

function mapErrorToText(error, t) {
  if (error?.code === telegramAuthErrors.TELEGRAM_CONTEXT_ERROR) {
    return t('tg_open_in_telegram');
  }

  if (error?.status === 401) {
    return t('tg_auth_failed');
  }

  return t('tg_auth_unavailable');
}

export function TelegramMiniAppGate({ children }) {
  const { t } = useI18n();
  const [status, setStatus] = useState('loading');
  const [errorText, setErrorText] = useState('');
  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const bootstrap = useCallback(async ({ force = false } = {}) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    if (isMountedRef.current) {
      setStatus('loading');
      setErrorText('');
    }

    const tg = getTelegramWebApp();
    const initData = getTelegramInitData();

    console.info('[tg-auth] bootstrap:init', {
      webAppAvailable: Boolean(tg),
      initDataPresent: Boolean(initData),
    });

    try {
      await telegramClientApi.login({ force });
      await telegramClientApi.me();

      if (!isMountedRef.current) return;
      setStatus('ready');
    } catch (error) {
      if (!isMountedRef.current) return;
      setStatus('error');
      setErrorText(mapErrorToText(error, t));
    } finally {
      inFlightRef.current = false;
    }
  }, [t]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (status === 'loading') {
    return <p>{t('loading')}</p>;
  }

  if (status === 'error') {
    return (
      <section className="status-card">
        <h2>{t('tg_auth_title')}</h2>
        <p className="notice notice-error">{errorText}</p>
        <button type="button" onClick={() => bootstrap({ force: true })}>{t('retry')}</button>
      </section>
    );
  }

  return children;
}
