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

export function buildProxyDriveUrl(req, driveUrl) {
  const fileId = extractDriveFileId(driveUrl);
  if (!fileId) return String(driveUrl || '');
  return `${req.protocol}://${req.get('host')}/proxy-drive/${encodeURIComponent(fileId)}`;
}
