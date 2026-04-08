export const MAX_UPLOAD_MEDIA_FILES = 6;
export const MAX_UPLOAD_MEDIA_FILE_SIZE = 30 * 1024 * 1024;

export function isAllowedUploadMimeType(mimeType = '') {
  const normalized = String(mimeType || '').trim().toLowerCase();
  return normalized.startsWith('image/') || normalized.startsWith('video/');
}

export function validateUploadedMediaFiles(files = [], { required = false } = {}) {
  const rows = Array.isArray(files) ? files : [];
  if (required && !rows.length) return 'media_required';
  if (!rows.length) return null;
  if (rows.length > MAX_UPLOAD_MEDIA_FILES) return 'too_many_media_files';

  for (const file of rows) {
    if (!isAllowedUploadMimeType(file?.mimetype)) return 'unsupported_media_type';
    if (Number(file?.size || 0) > MAX_UPLOAD_MEDIA_FILE_SIZE) return 'media_file_too_large';
  }

  return null;
}
