import { getAllowedCommercialTransitions, COMMERCIAL_TRANSITIONS } from './workflow/commercialTransitions.js';
import { normalizeWorkflowRole } from './workflow/roles.js';
import { getAllowedServiceTransitions, SERVICE_TRANSITIONS } from './workflow/serviceTransitions.js';
import { canChangeCommercialStatus as canChangeCommercialStatusGuard } from './workflow/serviceWorkflowGuards.js';

export { SERVICE_TRANSITIONS, COMMERCIAL_TRANSITIONS };

function normalizeStatus(status, fallback = '') {
  if (status === null || status === undefined) return fallback;
  return String(status).trim().toLowerCase();
}

export function canTransitionServiceStatus(fromStatus, toStatus) {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  if (!from || !to || from === to) return false;
  return Boolean(getAllowedServiceTransitions(from)[to]);
}

export function canRoleTransitionServiceStatus({ role, fromStatus, toStatus }) {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  if (!from || !to || from === to) return false;
  const allowed = getAllowedServiceTransitions(from)[to] || [];
  return allowed.includes(normalizeWorkflowRole(role));
}

export function canRoleTransitionCommercialStatus({ role, fromStatus, toStatus }) {
  const from = normalizeStatus(fromStatus, 'none') || 'none';
  const to = normalizeStatus(toStatus);
  if (!to || from === to) return false;

  const allowed = getAllowedCommercialTransitions(from)[to] || [];
  return allowed.includes(normalizeWorkflowRole(role));
}

export function canChangeCommercialStatus({ role, currentServiceStatus, fromCommercialStatus, toCommercialStatus }) {
  return canChangeCommercialStatusGuard({ role }, currentServiceStatus, fromCommercialStatus, toCommercialStatus);
}
