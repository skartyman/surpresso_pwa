import { buildProxyDriveUrl } from '../../infrastructure/drive/driveUtils.js';

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
        url: fileUrl,
        fileUrl,
        previewUrl,
        imgUrl: previewUrl,
      };
    }),
  };
}
