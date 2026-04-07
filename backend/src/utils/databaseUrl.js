function isLocalDatabaseUrl(value = '') {
  return /localhost|127\.0\.0\.1/i.test(value);
}

export function normalizeDatabaseUrl(databaseUrl = '') {
  const raw = String(databaseUrl || '').trim();
  if (!raw) return '';
  if (isLocalDatabaseUrl(raw)) return raw;

  try {
    const url = new URL(raw);
    const sslMode = url.searchParams.get('sslmode');
    if (!sslMode || ['prefer', 'require', 'verify-ca'].includes(sslMode)) {
      url.searchParams.set('sslmode', 'verify-full');
    }
    return url.toString();
  } catch {
    return raw;
  }
}
