import { buildProxyDriveUrl } from '../../infrastructure/drive/driveUtils.js';

function parseMediaStage(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized.startsWith('before_')) return 'before';
  if (normalized.startsWith('after_')) return 'after';
  return 'client';
}

export function enrichServiceRequestMedia(req, request) {
  if (!request) return request;

  return {
    ...request,
    media: (request.media || []).map((item) => {
      const fileUrl = String(item.fileUrl || item.url || '');
      const explicitPreview = String(item.previewUrl || item.imgUrl || '');
      const previewUrl = explicitPreview || (item.type === 'image' ? buildProxyDriveUrl(req, fileUrl) : '');

      return {
        ...item,
        stage: parseMediaStage(item.type),
        url: fileUrl,
        fileUrl,
        previewUrl,
        imgUrl: previewUrl,
      };
    }),
  };
}
