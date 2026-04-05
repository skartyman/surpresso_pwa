import { getAllowedCommercialTransitions } from './commercialTransitions.js';
import { hasPermission, PERMISSIONS } from './permissions.js';
import { normalizeWorkflowRole } from './roles.js';
import { getAllowedServiceTransitions } from './serviceTransitions.js';

function normalizeStatus(status, fallback = '') {
  if (status === null || status === undefined) return fallback;
  return String(status).trim().toLowerCase();
}

export function canAssignServiceCase(user, serviceCase) {
  const role = normalizeWorkflowRole(user?.role);
  if (!hasPermission(user, PERMISSIONS.serviceCaseAssign)) return false;
  if (!serviceCase) return false;
  if (role === 'service_head' || role === 'manager' || role === 'owner' || role === 'director') return true;
  return false;
}

export function evaluateServiceStatusChange(user, fromStatus, toStatus) {
  const role = normalizeWorkflowRole(user?.role);
  if (!hasPermission(user, PERMISSIONS.serviceCaseUpdateStatus)) return { allowed: false, reason: 'forbidden' };

  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  if (!from || !to || from === to) return { allowed: false, reason: 'invalid_transition' };

  const allowedByTransition = getAllowedServiceTransitions(from);
  const roles = allowedByTransition[to];
  if (!roles) return { allowed: false, reason: 'invalid_transition' };
  if (!roles.includes(role)) return { allowed: false, reason: 'forbidden_transition' };

  return { allowed: true };
}

export function canChangeServiceStatus(user, fromStatus, toStatus) {
  return evaluateServiceStatusChange(user, fromStatus, toStatus).allowed;
}

export function evaluateCommercialStatusChange(user, serviceStatus, fromCommercialStatus, toCommercialStatus) {
  const role = normalizeWorkflowRole(user?.role);
  if (!hasPermission(user, PERMISSIONS.equipmentUpdateCommercial)) return { allowed: false, reason: 'forbidden' };

  const normalizedServiceStatus = normalizeStatus(serviceStatus);
  if (normalizedServiceStatus && !['processed', 'closed'].includes(normalizedServiceStatus)) {
    return { allowed: false, reason: 'service_status_not_processed' };
  }

  const from = normalizeStatus(fromCommercialStatus, 'none') || 'none';
  const to = normalizeStatus(toCommercialStatus);
  if (!to || from === to) return { allowed: false, reason: 'invalid_transition' };

  const allowedByTransition = getAllowedCommercialTransitions(from);
  const roles = allowedByTransition[to];
  if (!roles) return { allowed: false, reason: 'invalid_transition' };
  if (!roles.includes(role)) return { allowed: false, reason: 'forbidden_transition' };

  return { allowed: true };
}

export function canChangeCommercialStatus(user, serviceStatus, fromCommercialStatus, toCommercialStatus) {
  return evaluateCommercialStatusChange(user, serviceStatus, fromCommercialStatus, toCommercialStatus).allowed;
}

export { hasPermission };
