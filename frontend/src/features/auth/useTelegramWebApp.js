import { useEffect } from 'react';

export function useTelegramWebApp() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    tg.ready();
    tg.expand();
    tg.setHeaderColor('#111827');
  }, []);
}
