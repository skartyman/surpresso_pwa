import { hasPermission, PERMISSIONS, ROLE_PERMISSIONS } from './workflow/permissions.js';
import { normalizeWorkflowRole } from './workflow/roles.js';

export { PERMISSIONS, ROLE_PERMISSIONS, hasPermission };
export const normalizeRole = normalizeWorkflowRole;
