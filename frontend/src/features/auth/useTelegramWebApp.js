import { useEffect } from 'react';

const compareVersions = (currentVersion = '0', minVersion = '0') => {
  const currentParts = String(currentVersion).split('.').map((part) => Number(part) || 0);
  const minParts = String(minVersion).split('.').map((part) => Number(part) || 0);
  const maxLength = Math.max(currentParts.length, minParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const current = currentParts[index] ?? 0;
    const required = minParts[index] ?? 0;

    if (current > required) return 1;
    if (current < required) return -1;
  }

  return 0;
};

const supportsVersion = (tg, minVersion) => compareVersions(tg?.version, minVersion) >= 0;
const supportsMethod = (tg, methodName) => typeof tg?.[methodName] === 'function';

export function useTelegramWebApp() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    tg.ready();
    tg.expand();

    if (supportsMethod(tg, 'setHeaderColor') && supportsVersion(tg, '6.1')) {
      tg.setHeaderColor('#111827');
    }

    if (supportsMethod(tg, 'setBottomBarColor') && supportsVersion(tg, '7.10')) {
      tg.setBottomBarColor('#111827');
    }
  }, []);
}
