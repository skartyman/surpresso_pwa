import { WORKFLOW_ROLES } from './roles.js';

export const SERVICE_TRANSITIONS = {
  accepted: {
    in_progress: [WORKFLOW_ROLES.serviceEngineer, WORKFLOW_ROLES.serviceHead, WORKFLOW_ROLES.manager, WORKFLOW_ROLES.owner],
  },
  in_progress: {
    testing: [WORKFLOW_ROLES.serviceEngineer, WORKFLOW_ROLES.serviceHead, WORKFLOW_ROLES.manager, WORKFLOW_ROLES.owner],
  },
  testing: {
    in_progress: [WORKFLOW_ROLES.serviceEngineer, WORKFLOW_ROLES.serviceHead, WORKFLOW_ROLES.manager, WORKFLOW_ROLES.owner],
    ready: [WORKFLOW_ROLES.serviceEngineer, WORKFLOW_ROLES.serviceHead, WORKFLOW_ROLES.manager, WORKFLOW_ROLES.owner],
  },
  ready: {
    in_progress: [WORKFLOW_ROLES.serviceHead, WORKFLOW_ROLES.manager, WORKFLOW_ROLES.director, WORKFLOW_ROLES.owner],
    processed: [WORKFLOW_ROLES.director, WORKFLOW_ROLES.owner],
  },
  processed: {
    closed: [WORKFLOW_ROLES.director, WORKFLOW_ROLES.owner],
  },
  closed: {},
};

export function getAllowedServiceTransitions(fromStatus) {
  return SERVICE_TRANSITIONS[String(fromStatus || '').trim().toLowerCase()] || {};
}
