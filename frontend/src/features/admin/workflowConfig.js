const SERVICE_TRANSITIONS = {
  accepted: { in_progress: ['service_engineer', 'service_head', 'manager', 'owner'] },
  in_progress: { testing: ['service_engineer', 'service_head', 'manager', 'owner'] },
  testing: {
    in_progress: ['service_engineer', 'service_head', 'manager', 'owner'],
    ready: ['service_engineer', 'service_head', 'manager', 'owner'],
  },
  ready: { in_progress: ['service_head', 'manager', 'director', 'owner'], processed: ['director', 'owner'] },
  processed: { closed: ['director', 'owner'] },
  closed: {},
};

const COMMERCIAL_TRANSITIONS = {
  none: { ready_for_issue: ['director', 'owner'], ready_for_rent: ['director', 'owner'], ready_for_sale: ['director', 'owner'] },
  ready_for_issue: { issued_to_client: ['director', 'manager', 'owner'] },
  ready_for_rent: { reserved_for_rent: ['sales_manager', 'owner'], out_on_replacement: ['sales_manager', 'owner'] },
  reserved_for_rent: { out_on_rent: ['sales_manager', 'owner'] },
  ready_for_sale: { reserved_for_sale: ['sales_manager', 'owner'] },
  reserved_for_sale: { sold: ['sales_manager', 'owner'] },
  out_on_rent: {},
  out_on_replacement: {},
  sold: {},
  issued_to_client: {},
};

function normalize(value, fallback = '') {
  if (value == null) return fallback;
  return String(value).trim().toLowerCase();
}

export function getAvailableServiceActions(role, fromStatus) {
  const from = normalize(fromStatus);
  const normalizedRole = normalize(role);
  if (!from) return [];
  return Object.entries(SERVICE_TRANSITIONS[from] || {})
    .filter(([, roles]) => roles.includes(normalizedRole))
    .map(([toStatus]) => toStatus);
}

export function getAvailableCommercialActions(role, serviceStatus, fromStatus) {
  const normalizedServiceStatus = normalize(serviceStatus);
  if (normalizedServiceStatus && !['processed', 'closed'].includes(normalizedServiceStatus)) return [];

  const from = normalize(fromStatus, 'none') || 'none';
  const normalizedRole = normalize(role);
  return Object.entries(COMMERCIAL_TRANSITIONS[from] || {})
    .filter(([, roles]) => roles.includes(normalizedRole))
    .map(([toStatus]) => toStatus);
}
