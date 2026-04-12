import crypto from 'node:crypto';
import path from 'node:path';
import { config } from '../../config/env.js';

const REGION = 'auto';
const SERVICE = 's3';
const ALGORITHM = 'AWS4-HMAC-SHA256';

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function getSignatureKey(secretKey, dateStamp) {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
}

function toAmzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function encodeObjectKey(key) {
  return String(key || '')
    .split('/')
    .map(part => encodeURIComponent(part))
    .join('/');
}

function safeFileName(name = 'file') {
  const ext = path.extname(name).toLowerCase();
  const base = path.basename(name, ext)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'file';
  return `${base}${ext || ''}`;
}

function buildObjectKey({ prefix = 'catalog', file, entityId }) {
  const now = new Date();
  const datePath = now.toISOString().slice(0, 10);
  const random = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return [
    prefix,
    datePath,
    String(entityId || 'item').replace(/[^a-z0-9_-]+/gi, '-'),
    `${random}-${safeFileName(file?.originalname || 'file')}`,
  ].join('/');
}

export function isR2Configured() {
  return Boolean(
    config.r2AccountId &&
    config.r2AccessKeyId &&
    config.r2SecretAccessKey &&
    config.r2Bucket &&
    config.r2PublicBaseUrl
  );
}

export async function uploadR2Media({ file, prefix = 'catalog', entityId }) {
  if (!isR2Configured()) {
    const error = new Error('r2_not_configured');
    error.code = 'r2_not_configured';
    throw error;
  }

  if (!file?.buffer) {
    const error = new Error('file_buffer_required');
    error.code = 'file_buffer_required';
    throw error;
  }

  const objectKey = buildObjectKey({ prefix, file, entityId });
  const encodedKey = encodeObjectKey(objectKey);
  const host = `${config.r2AccountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${config.r2Bucket}/${encodedKey}`;
  const endpoint = `https://${host}${canonicalUri}`;
  const amzDate = toAmzDate();
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(file.buffer);
  const contentType = file.mimetype || 'application/octet-stream';

  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    '',
  ].join('\n');
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    ALGORITHM,
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signingKey = getSignatureKey(config.r2SecretAccessKey, dateStamp);
  const signature = hmac(signingKey, stringToSign, 'hex');
  const authorization = `${ALGORITHM} Credential=${config.r2AccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    },
    body: file.buffer,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error(`r2_upload_failed:${response.status}`);
    error.code = 'r2_upload_failed';
    error.status = response.status;
    error.detail = detail.slice(0, 500);
    throw error;
  }

  const publicBase = config.r2PublicBaseUrl.replace(/\/+$/g, '');
  const fileUrl = `${publicBase}/${encodedKey}`;
  return {
    filePath: `r2:${objectKey}`,
    fileId: objectKey,
    fileUrl,
    previewUrl: fileUrl,
    mimeType: contentType,
    originalName: file.originalname || path.basename(objectKey),
    size: file.size || file.buffer.length || 0,
  };
}
