const STORAGE_KEY = 'surpresso.admin.equipment-card-covers';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readMap() {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getEquipmentCardCover(equipmentId) {
  if (!equipmentId) return '';
  const map = readMap();
  return String(map[equipmentId]?.url || '');
}

export function setEquipmentCardCover(equipmentId, media) {
  if (!equipmentId || !media) return '';
  const url = String(media.previewUrl || media.fullUrl || media.fileUrl || '');
  if (!url) return '';
  const map = readMap();
  map[equipmentId] = {
    mediaId: media.id || null,
    url,
    updatedAt: new Date().toISOString(),
  };
  writeMap(map);
  return url;
}
