import { buildProxyDriveUrl } from '../../infrastructure/drive/driveUtils.js';

function normalizeMediaType(kind = '', mimeType = '') {
  const value = String(kind || mimeType || '').toLowerCase();
  if (value.includes('video')) return 'video';
  return 'photo';
}

export function normalizeEquipmentMedia(req, media = []) {
  return (media || []).map((item) => {
    const sourceUrl = String(item.fileUrl || item.url || '');
    const mediaType = normalizeMediaType(item.kind, item.mimeType);
    const previewUrl = String(item.previewUrl || '')
      || buildProxyDriveUrl(req, sourceUrl)
      || sourceUrl;
    const fullUrl = buildProxyDriveUrl(req, sourceUrl) || sourceUrl;

    return {
      ...item,
      mediaType,
      sourceUrl,
      previewUrl,
      fullUrl,
      uploadedBy: item.uploadedByUser?.fullName || item.uploadedBy || null,
      serviceCaseId: item.serviceCaseId || null,
    };
  });
}

export function buildEquipmentTimeline(detail = {}) {
  const timeline = [];

  (detail.history || []).forEach((row) => {
    timeline.push({
      id: `history-${row.id}`,
      type: row.eventType === 'commercial' ? 'commercial_status_changed' : (row.raw ? 'legacy_event' : 'service_status_changed'),
      timestamp: row.timestamp || null,
      actor: row.actor?.fullName || row.actorLabel || 'system',
      comment: row.comment || null,
      payload: {
        fromStatus: row.fromStatus || null,
        toStatus: row.toStatus || null,
        serviceCaseId: row.serviceCaseId || null,
        raw: row.raw || null,
      },
    });
  });

  (detail.serviceCases || []).forEach((item) => {
    if (item.assignedAt) {
      timeline.push({
        id: `assignment-${item.id}-${item.assignedAt}`,
        type: 'assignment',
        timestamp: item.assignedAt,
        actor: item.assignedByUser?.fullName || 'system',
        comment: `Назначено на ${item.assignedToUser?.fullName || item.assignedToUserId || '—'}`,
        payload: { serviceCaseId: item.id },
      });
    }
    if (item.processedAt) {
      timeline.push({
        id: `processing-${item.id}-${item.processedAt}`,
        type: 'processed',
        timestamp: item.processedAt,
        actor: item.processedByUser?.fullName || 'system',
        comment: item.closingComment || 'Кейс обработан',
        payload: { serviceCaseId: item.id },
      });
    }
  });

  (detail.media || []).forEach((item) => {
    timeline.push({
      id: `media-${item.id}`,
      type: 'media_uploaded',
      timestamp: item.createdAt || null,
      actor: item.uploadedByUser?.fullName || item.uploadedBy || 'system',
      comment: item.caption || item.originalName || 'Загрузка медиа',
      payload: { serviceCaseId: item.serviceCaseId || null, mediaId: item.id, mediaType: item.mediaType || item.kind || 'photo' },
    });
  });

  (detail.notes || []).forEach((item) => {
    timeline.push({
      id: `note-${item.id}`,
      type: 'note_added',
      timestamp: item.createdAt || null,
      actor: item.authorUser?.fullName || 'system',
      comment: item.body || null,
      payload: { serviceCaseId: item.serviceCaseId || null, isInternal: item.isInternal ?? true },
    });
  });

  return timeline
    .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
}
