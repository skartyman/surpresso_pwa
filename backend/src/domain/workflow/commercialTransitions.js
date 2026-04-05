import { WORKFLOW_ROLES } from './roles.js';

export const COMMERCIAL_TRANSITIONS = {
  none: {
    ready_for_issue: [WORKFLOW_ROLES.director, WORKFLOW_ROLES.owner],
    ready_for_rent: [WORKFLOW_ROLES.director, WORKFLOW_ROLES.owner],
    ready_for_sale: [WORKFLOW_ROLES.director, WORKFLOW_ROLES.owner],
  },
  ready_for_issue: {
    issued_to_client: [WORKFLOW_ROLES.director, WORKFLOW_ROLES.manager, WORKFLOW_ROLES.owner],
  },
  ready_for_rent: {
    reserved_for_rent: [WORKFLOW_ROLES.salesManager, WORKFLOW_ROLES.owner],
    out_on_replacement: [WORKFLOW_ROLES.salesManager, WORKFLOW_ROLES.owner],
  },
  reserved_for_rent: {
    out_on_rent: [WORKFLOW_ROLES.salesManager, WORKFLOW_ROLES.owner],
  },
  ready_for_sale: {
    reserved_for_sale: [WORKFLOW_ROLES.salesManager, WORKFLOW_ROLES.owner],
  },
  reserved_for_sale: {
    sold: [WORKFLOW_ROLES.salesManager, WORKFLOW_ROLES.owner],
  },
  out_on_rent: {},
  out_on_replacement: {},
  sold: {},
  issued_to_client: {},
};

export function getAllowedCommercialTransitions(fromStatus) {
  return COMMERCIAL_TRANSITIONS[String(fromStatus || 'none').trim().toLowerCase() || 'none'] || {};
}
