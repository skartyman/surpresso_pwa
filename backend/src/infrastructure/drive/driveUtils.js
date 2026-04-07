export function extractDriveFileId(driveUrl) {
  if (!driveUrl) return '';
  const source = String(driveUrl);

  if (source.includes('uc?export=view&id=')) {
    const match = source.match(/id=([^&]+)/i);
    return match ? match[1] : '';
  }

  if (source.includes('/file/d/')) {
    const match = source.match(/\/file\/d\/([^/]+)/i);
    return match ? match[1] : '';
  }

  if (source.includes('id=')) {
    const match = source.match(/[?&]id=([^&]+)/i);
    return match ? match[1] : '';
  }

  return '';
}

function getForwardedProto(req) {
  const raw = String(req?.get?.('x-forwarded-proto') || '').trim();
  return raw.split(',')[0]?.trim().toLowerCase() || '';
}

export function getRequestOrigin(req) {
  const host = String(req?.get?.('host') || '').trim();
  const forwardedProto = getForwardedProto(req);
  const protocol = forwardedProto || String(req?.protocol || '').trim().toLowerCase() || 'http';
  const safeProtocol = protocol === 'https' || host.endsWith('.fly.dev') ? 'https' : protocol;
  return host ? `${safeProtocol}://${host}` : '';
}

export function normalizeRequestUrl(req, value) {
  const source = String(value || '').trim();
  if (!source) return '';

  const origin = getRequestOrigin(req);
  if (!origin) return source;

  if (source.startsWith('/')) return `${origin}${source}`;
  if (source.startsWith('//')) return `https:${source}`;

  try {
    const url = new URL(source);
    const requestHost = String(req?.get?.('host') || '').trim().toLowerCase();
    const shouldForceHttps = getForwardedProto(req) === 'https' || requestHost.endsWith('.fly.dev');
    if (url.protocol === 'http:' && (shouldForceHttps || url.host.toLowerCase() === requestHost)) {
      url.protocol = 'https:';
    }
    return url.toString();
  } catch {
    return source;
  }
}

export function buildProxyDriveUrl(req, driveUrl) {
  const fileId = extractDriveFileId(driveUrl);
  if (!fileId) return normalizeRequestUrl(req, driveUrl);
  const origin = getRequestOrigin(req);
  if (!origin) return String(driveUrl || '');
  return `${origin}/proxy-drive/${encodeURIComponent(fileId)}`;
}
