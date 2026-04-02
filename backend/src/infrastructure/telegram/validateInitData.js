import crypto from 'crypto';

export function validateTelegramInitData(initDataRaw, botToken) {
  if (!initDataRaw || !botToken) return { valid: false, data: null };

  const params = new URLSearchParams(initDataRaw);
  const hash = params.get('hash');
  if (!hash) return { valid: false, data: null };

  params.delete('hash');
  const checkString = [...params.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
  const valid = computed === hash;

  let parsedUser = null;
  try {
    parsedUser = JSON.parse(params.get('user') || '{}');
  } catch {
    parsedUser = null;
  }

  return { valid, data: { user: parsedUser, authDate: params.get('auth_date') } };
}
