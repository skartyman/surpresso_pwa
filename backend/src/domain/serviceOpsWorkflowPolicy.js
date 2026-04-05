const SERVICE_TRANSITIONS = {
  accepted: {
    in_progress: ['service_engineer', 'service_head'],
  },
  in_progress: {
    testing: ['service_engineer', 'service_head'],
  },
  testing: {
    ready: ['service_engineer', 'service_head'],
    in_progress: ['service_engineer', 'service_head'],
  },
  ready: {
    in_progress: ['service_head', 'director'],
    processed: ['director'],
  },
  processed: {
    closed: ['director'],
  },
};

const COMMERCIAL_TRANSITIONS = {
  none: {
    ready_for_issue: ['director'],
    ready_for_rent: ['director'],
    ready_for_sale: ['director'],
  },
  ready_for_rent: {
    reserved_for_rent: ['sales_manager'],
    out_on_replacement: ['sales_manager'],
  },
  reserved_for_rent: {
    out_on_rent: ['sales_manager'],
  },
  ready_for_sale: {
    reserved_for_sale: ['sales_manager'],
  },
  reserved_for_sale: {
    sold: ['sales_manager'],
  },
  ready_for_issue: {
    issued_to_client: ['director', 'manager', 'sales_manager'],
  },
};

const OWNER_OVERRIDE_ROLES = new Set(['owner']);

function normalizeRole(role) {
  if (!role) return '';
  return String(role)
    .trim()
    .toLowerCase()
    .replaceAll('-', '_');
}

function normalizeStatus(status, fallback = 'none') {
  if (!status) return fallback;
  return String(status).trim().toLowerCase();
}

function isAllowedByRole(roles, role) {
  const normalizedRole = normalizeRole(role);
  if (OWNER_OVERRIDE_ROLES.has(normalizedRole)) return true;
  return roles.includes(normalizedRole);
}

export function canTransitionServiceStatus(fromStatus, toStatus) {
  const from = normalizeStatus(fromStatus, '');
  const to = normalizeStatus(toStatus, '');
  if (!from || !to || from === to) return false;
  return Boolean(SERVICE_TRANSITIONS[from]?.[to]);
}

export function canRoleTransitionServiceStatus({ role, fromStatus, toStatus }) {
  const from = normalizeStatus(fromStatus, '');
  const to = normalizeStatus(toStatus, '');
  if (from === to) return true;
  const allowedRoles = SERVICE_TRANSITIONS[from]?.[to];
  if (!allowedRoles) return false;
  return isAllowedByRole(allowedRoles, role);
}

export function canTransitionCommercialStatus(fromStatus, toStatus) {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  if (!to || from === to) return false;
  return Boolean(COMMERCIAL_TRANSITIONS[from]?.[to]);
}

export function canRoleTransitionCommercialStatus({ role, fromStatus, toStatus }) {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  if (from === to) return true;
  const allowedRoles = COMMERCIAL_TRANSITIONS[from]?.[to];
  if (!allowedRoles) return false;
  return isAllowedByRole(allowedRoles, role);
}

export function canApplyCommercialStatusForServiceStatus({ serviceStatus, commercialStatus }) {
  const normalizedServiceStatus = normalizeStatus(serviceStatus, '');
  const normalizedCommercialStatus = normalizeStatus(commercialStatus, '');

  if (!normalizedCommercialStatus) return false;

  const rentalOrSaleStatuses = new Set([
    'ready_for_rent',
    'reserved_for_rent',
    'out_on_rent',
    'out_on_replacement',
    'ready_for_sale',
    'reserved_for_sale',
    'sold',
  ]);

  if (normalizedCommercialStatus === 'sold' || rentalOrSaleStatuses.has(normalizedCommercialStatus)) {
    return normalizedServiceStatus === 'processed' || normalizedServiceStatus === 'closed';
  }

  return true;
}
