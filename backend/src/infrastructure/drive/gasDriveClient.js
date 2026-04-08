import { config } from '../../config/env.js';

function toBase64(buffer) {
  return Buffer.from(buffer).toString('base64');
}

async function gasPost(payload) {
  if (!config.gasWebAppUrl || !config.gasServerKey) {
    throw new Error('gas_not_configured');
  }

  const response = await fetch(config.gasWebAppUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: config.gasServerKey, ...payload }),
  });

  const text = await response.text();
  let parsed;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('gas_non_json_response');
  }

  if (!parsed?.ok) {
    throw new Error(parsed?.error || 'gas_error');
  }

  return parsed;
}

function normalizeFileType(mimeType) {
  return String(mimeType || '').toLowerCase().startsWith('video') ? 'video' : 'image';
}

export async function uploadDriveMedia({ entityId, file }) {
  const uploadResult = await gasPost({
    action: 'serviceRequestMediaUpload',
    entityType: 'service_request',
    entityId,
    base64: toBase64(file.buffer || Buffer.alloc(0)),
    mimeType: file.mimetype || 'application/octet-stream',
    originalName: file.originalname || file.filename || `file-${Date.now()}`,
  });

  return {
    id: `media-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    type: normalizeFileType(file.mimetype),
    fileId: String(uploadResult.fileId || ''),
    fileUrl: String(uploadResult.fileUrl || ''),
    previewUrl: String(uploadResult.imgUrl || ''),
    mimeType: String(file.mimetype || ''),
    originalName: String(file.originalname || ''),
    size: Number(file.size || 0),
  };
}

export async function uploadServiceRequestMedia({ entityId, file }) {
  return uploadDriveMedia({ entityId, file });
}
