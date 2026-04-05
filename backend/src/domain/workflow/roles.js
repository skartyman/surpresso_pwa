export const WORKFLOW_ROLES = {
  serviceEngineer: 'service_engineer',
  serviceHead: 'service_head',
  manager: 'manager',
  director: 'director',
  owner: 'owner',
  salesManager: 'sales_manager',
};

const ROLE_ALIASES = {
  serviceEngineer: WORKFLOW_ROLES.serviceEngineer,
  serviceHead: WORKFLOW_ROLES.serviceHead,
  salesManager: WORKFLOW_ROLES.salesManager,
};

export function normalizeWorkflowRole(role) {
  if (!role) return '';
  const normalized = String(role).trim();
  return ROLE_ALIASES[normalized] || normalized.toLowerCase();
}
