import { buildProxyDriveUrl, normalizeRequestUrl } from '../../infrastructure/drive/driveUtils.js';

function parseMediaStage(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized.startsWith('before_')) return 'before';
  if (normalized.startsWith('after_')) return 'after';
  return 'client';
}

function parseMediaKind(item = {}) {
  const mimeType = String(item.mimeType || '').trim().toLowerCase();
  const type = String(item.type || '').trim().toLowerCase();
  if (mimeType.startsWith('video/') || type.includes('video')) return 'video';
  return 'image';
}

export function enrichServiceRequestMedia(req, request) {
  if (!request) return request;

  return {
    ...request,
    media: (request.media || []).map((item) => {
      const mediaKind = parseMediaKind(item);
      const externalUrl = normalizeRequestUrl(req, item.fileUrl || item.url || '');
      const fileUrl = buildProxyDriveUrl(req, externalUrl) || externalUrl;
      const explicitPreview = normalizeRequestUrl(req, item.previewUrl || item.imgUrl || '');
      const previewUrl = (buildProxyDriveUrl(req, explicitPreview) || explicitPreview)
        || fileUrl;

      return {
        ...item,
        mediaKind,
        stage: parseMediaStage(item.type),
        url: fileUrl,
        externalUrl,
        fileUrl,
        previewUrl,
        imgUrl: previewUrl,
      };
    }),
  };
}
