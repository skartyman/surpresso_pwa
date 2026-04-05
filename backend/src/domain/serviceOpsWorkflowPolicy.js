import {
  canChangeCommercialStatus,
  canRoleTransitionCommercialStatus,
  canRoleTransitionServiceStatus,
  canTransitionServiceStatus,
} from './transitions.js';

export {
  canRoleTransitionCommercialStatus,
  canRoleTransitionServiceStatus,
  canTransitionServiceStatus,
};

export function canApplyCommercialStatusForServiceStatus({ serviceStatus, commercialStatus }) {
  return canChangeCommercialStatus({
    role: 'owner',
    currentServiceStatus: serviceStatus,
    fromCommercialStatus: null,
    toCommercialStatus: commercialStatus,
  });
}
