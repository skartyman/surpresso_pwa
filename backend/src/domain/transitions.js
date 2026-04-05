import { normalizeRole } from './roles.js';

export const SERVICE_TRANSITIONS = {
  accepted: {
    in_progress: ['service_engineer', 'service_head', 'manager'],
  },
  in_progress: {
    testing: ['service_engineer', 'service_head', 'manager'],
  },
  testing: {
    in_progress: ['service_engineer', 'service_head', 'manager'],
    ready: ['service_engineer', 'service_head', 'manager'],
  },
  ready: {
    in_progress: ['service_head', 'director', 'manager'],
    processed: ['director'],
  },
  processed: {
    closed: ['director'],
  },
  closed: {},
};

export const COMMERCIAL_TRANSITIONS = {
  none: {
    ready_for_issue: ['director'],
    ready_for_rent: ['director'],
    ready_for_sale: ['director'],
  },
  ready_for_issue: {
    issued_to_client: ['director', 'manager'],
  },
  ready_for_rent: {
    reserved_for_rent: ['sales_manager'],
    out_on_replacement: ['sales_manager'],
  },
  reserved_for_rent: {
    out_on_rent: ['sales_manager'],
    ready_for_rent: ['sales_manager'],
  },
  out_on_rent: {
    ready_for_rent: ['sales_manager', 'director'],
  },
  out_on_replacement: {
    ready_for_rent: ['sales_manager', 'director'],
  },
  ready_for_sale: {
    reserved_for_sale: ['sales_manager'],
  },
  reserved_for_sale: {
    sold: ['sales_manager'],
    ready_for_sale: ['sales_manager'],
  },
  sold: {},
  issued_to_client: {},
};

function normalizeStatus(status, fallback = '') {
  if (status === null || status === undefined) return fallback;
  return String(status).trim().toLowerCase();
}

export function canTransitionServiceStatus(fromStatus, toStatus) {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  if (!from || !to || from === to) return false;
  return Boolean(SERVICE_TRANSITIONS[from]?.[to]);
}

export function canRoleTransitionServiceStatus({ role, fromStatus, toStatus }) {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  if (!from || !to || from === to) return false;
  const allowed = SERVICE_TRANSITIONS[from]?.[to] || [];
  return allowed.includes(normalizeRole(role));
}

export function canRoleTransitionCommercialStatus({ role, fromStatus, toStatus }) {
  const from = normalizeStatus(fromStatus, 'none');
  const to = normalizeStatus(toStatus);
  const normalizedRole = normalizeRole(role);

  if (!to || from === to) return false;
  if (normalizedRole === 'owner') return true;

  const allowed = COMMERCIAL_TRANSITIONS[from]?.[to] || [];
  return allowed.includes(normalizedRole);
}

export function canChangeCommercialStatus({
  role,
  currentServiceStatus,
  fromCommercialStatus,
  toCommercialStatus,
}) {
  const normalizedRole = normalizeRole(role);
  if (!['director', 'sales_manager', 'manager', 'owner'].includes(normalizedRole)) return false;

  const normalizedServiceStatus = normalizeStatus(currentServiceStatus, '');
  if (normalizedServiceStatus && !['processed', 'closed'].includes(normalizedServiceStatus)) return false;

  if (normalizedRole === 'owner') return true;
  const allowed = COMMERCIAL_TRANSITIONS[normalizeStatus(fromCommercialStatus, 'none')]?.[normalizeStatus(toCommercialStatus)] || [];
  return allowed.includes(normalizedRole);
}
