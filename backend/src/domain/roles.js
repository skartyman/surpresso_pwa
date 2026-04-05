export const PERMISSIONS = {
  serviceCaseRead: 'serviceCase.read',
  serviceCaseAssign: 'serviceCase.assign',
  serviceCaseUpdateStatus: 'serviceCase.updateStatus',
  serviceCaseAddNote: 'serviceCase.addNote',
  serviceCaseUploadMedia: 'serviceCase.uploadMedia',
  serviceDashboardRead: 'serviceDashboard.read',

  equipmentRead: 'equipment.read',
  equipmentUpdateCommercial: 'equipment.updateCommercial',

  directorProcess: 'director.process',
  salesOperate: 'sales.operate',

  analyticsRead: 'analytics.read',
};

const ROLE_ALIASES = {
  serviceEngineer: 'service_engineer',
  serviceHead: 'service_head',
  salesManager: 'sales_manager',
};

export function normalizeRole(role) {
  if (!role) return '';
  const normalized = String(role).trim();
  return ROLE_ALIASES[normalized] || normalized.toLowerCase();
}

export const ROLE_PERMISSIONS = {
  manager: [
    PERMISSIONS.serviceCaseRead,
    PERMISSIONS.serviceCaseAssign,
    PERMISSIONS.serviceCaseUpdateStatus,
    PERMISSIONS.serviceCaseAddNote,
    PERMISSIONS.serviceCaseUploadMedia,
    PERMISSIONS.serviceDashboardRead,
    PERMISSIONS.equipmentRead,
    PERMISSIONS.equipmentUpdateCommercial,
  ],
  service_engineer: [
    PERMISSIONS.serviceCaseRead,
    PERMISSIONS.serviceCaseUpdateStatus,
    PERMISSIONS.serviceCaseAddNote,
    PERMISSIONS.serviceCaseUploadMedia,
    PERMISSIONS.equipmentRead,
  ],
  service_head: [
    PERMISSIONS.serviceCaseRead,
    PERMISSIONS.serviceCaseAssign,
    PERMISSIONS.serviceCaseUpdateStatus,
    PERMISSIONS.serviceCaseAddNote,
    PERMISSIONS.serviceCaseUploadMedia,
    PERMISSIONS.serviceDashboardRead,
    PERMISSIONS.equipmentRead,
  ],
  director: [
    PERMISSIONS.serviceCaseRead,
    PERMISSIONS.serviceDashboardRead,
    PERMISSIONS.equipmentRead,
    PERMISSIONS.directorProcess,
    PERMISSIONS.equipmentUpdateCommercial,
    PERMISSIONS.analyticsRead,
  ],
  sales_manager: [
    PERMISSIONS.equipmentRead,
    PERMISSIONS.equipmentUpdateCommercial,
    PERMISSIONS.salesOperate,
  ],
  owner: ['*'],
  seo: [PERMISSIONS.analyticsRead],
};

export function hasPermission(user, permission) {
  const role = normalizeRole(user?.role);
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(permission);
}
