export const SERVICE_REQUEST_STATUSES = [
  'new',
  'assigned',
  'taken_in_work',
  'ready_for_qc',
  'on_service_head_control',
  'to_director',
  'invoiced',
  'closed',
  'cancelled',
];

export const ACTIVE_SERVICE_REQUEST_STATUSES = [
  'new',
  'assigned',
  'taken_in_work',
  'ready_for_qc',
  'on_service_head_control',
  'to_director',
  'invoiced',
];

export function normalizeServiceRequestStatus(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return SERVICE_REQUEST_STATUSES.includes(normalized) ? normalized : null;
}

export function isServiceRequestClosed(status) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'closed' || normalized === 'cancelled';
}
