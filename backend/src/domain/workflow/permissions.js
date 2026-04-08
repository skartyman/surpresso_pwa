import { normalizeWorkflowRole, WORKFLOW_ROLES } from './roles.js';

export const PERMISSIONS = {
  serviceCaseRead: 'serviceCase.read',
  serviceCaseAssign: 'serviceCase.assign',
  serviceCaseUpdateStatus: 'serviceCase.updateStatus',
  serviceCaseAddNote: 'serviceCase.addNote',
  serviceCaseUploadMedia: 'serviceCase.uploadMedia',
  serviceDashboardRead: 'serviceDashboard.read',
  equipmentRead: 'equipment.read',
  equipmentDelete: 'equipment.delete',
  equipmentUpdateCommercial: 'equipment.updateCommercial',
  directorProcess: 'director.process',
  salesOperate: 'sales.operate',
  analyticsRead: 'analytics.read',
};

export const ROLE_PERMISSIONS = {
  [WORKFLOW_ROLES.manager]: [
    PERMISSIONS.serviceCaseRead,
    PERMISSIONS.serviceCaseAssign,
    PERMISSIONS.serviceCaseUpdateStatus,
    PERMISSIONS.serviceCaseAddNote,
    PERMISSIONS.serviceCaseUploadMedia,
    PERMISSIONS.serviceDashboardRead,
    PERMISSIONS.equipmentRead,
    PERMISSIONS.equipmentUpdateCommercial,
  ],
  [WORKFLOW_ROLES.serviceEngineer]: [
    PERMISSIONS.serviceCaseRead,
    PERMISSIONS.serviceCaseUpdateStatus,
    PERMISSIONS.serviceCaseAddNote,
    PERMISSIONS.serviceCaseUploadMedia,
    PERMISSIONS.equipmentRead,
  ],
  [WORKFLOW_ROLES.serviceHead]: [
    PERMISSIONS.serviceCaseRead,
    PERMISSIONS.serviceCaseAssign,
    PERMISSIONS.serviceCaseUpdateStatus,
    PERMISSIONS.serviceCaseAddNote,
    PERMISSIONS.serviceCaseUploadMedia,
    PERMISSIONS.serviceDashboardRead,
    PERMISSIONS.equipmentRead,
    PERMISSIONS.equipmentDelete,
  ],
  [WORKFLOW_ROLES.director]: [
    PERMISSIONS.serviceCaseRead,
    PERMISSIONS.serviceDashboardRead,
    PERMISSIONS.equipmentRead,
    PERMISSIONS.equipmentDelete,
    PERMISSIONS.directorProcess,
    PERMISSIONS.equipmentUpdateCommercial,
    PERMISSIONS.analyticsRead,
  ],
  [WORKFLOW_ROLES.salesManager]: [
    PERMISSIONS.equipmentRead,
    PERMISSIONS.equipmentUpdateCommercial,
    PERMISSIONS.salesOperate,
  ],
  [WORKFLOW_ROLES.owner]: ['*'],
  seo: [PERMISSIONS.analyticsRead],
};

export function hasPermission(user, permission) {
  const role = normalizeWorkflowRole(user?.role);
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(permission);
}
