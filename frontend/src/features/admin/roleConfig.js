export const ROLES = {
  manager: 'manager',
  serviceEngineer: 'service_engineer',
  serviceHead: 'service_head',
  salesManager: 'sales_manager',
  owner: 'owner',
  director: 'director',
  seo: 'seo',
};

export function getRoleLabels(t) {
  return {
    [ROLES.manager]: t('role_manager'),
    [ROLES.serviceEngineer]: t('role_service_engineer'),
    [ROLES.serviceHead]: t('role_service_head'),
    [ROLES.salesManager]: t('role_sales_manager'),
    [ROLES.owner]: t('role_owner'),
    [ROLES.director]: t('role_director'),
    [ROLES.seo]: t('role_seo'),
  };
}

export const ROLE_LABELS = {
  [ROLES.manager]: 'Менеджер',
  [ROLES.serviceEngineer]: 'Сервисный инженер',
  [ROLES.serviceHead]: 'Руководитель сервиса',
  [ROLES.salesManager]: 'Менеджер по продажам',
  [ROLES.owner]: 'Собственник',
  [ROLES.director]: 'Директор',
  [ROLES.seo]: 'SEO',
};

const ALL_ROLES = Object.values(ROLES);

export function getAdminSections(t) {
  return [
  {
    key: 'operations',
    label: t('nav_operations'),
    items: [
      { key: 'service', to: 'service', icon: 'service', label: t('nav_service'), roles: [ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director] },
      { key: 'employees', to: 'employees', icon: 'employees', label: t('nav_employees'), roles: [ROLES.serviceHead, ROLES.salesManager, ROLES.director, ROLES.owner, ROLES.seo] },
      { key: 'director', to: 'director', icon: 'dashboard', label: t('nav_director'), roles: [ROLES.director, ROLES.owner] },
      { key: 'sales', to: 'sales', icon: 'sales', label: t('nav_sales'), roles: [ROLES.salesManager, ROLES.owner, ROLES.director] },
      { key: 'equipment', to: 'equipment', icon: 'equipment', label: t('nav_equipment'), roles: [ROLES.serviceEngineer, ROLES.serviceHead, ROLES.salesManager, ROLES.director, ROLES.owner] },
    ],
  },
  {
    key: 'management',
    label: t('nav_management'),
    items: [
      { key: 'executive', to: 'executive', icon: 'dashboard', label: t('nav_executive'), roles: [ROLES.director, ROLES.owner] },
      { key: 'reports', to: 'reports', icon: 'reports', label: t('nav_reports'), roles: [ROLES.serviceHead, ROLES.salesManager, ROLES.director, ROLES.owner] },
      { key: 'notifications', to: 'notifications', icon: 'bell', label: t('nav_notifications'), roles: [ROLES.serviceHead, ROLES.director, ROLES.owner] },
    ],
  },
  {
    key: 'content',
    label: t('nav_content'),
    items: [
      { key: 'content', to: 'content', icon: 'content', label: t('nav_content_seo'), roles: [ROLES.seo, ROLES.owner] },
    ],
  },
  {
    key: 'system',
    label: t('nav_system'),
    items: [
      { key: 'settings', to: 'settings', icon: 'settings', label: t('nav_settings'), roles: ALL_ROLES },
    ],
  },
];
}

export const ADMIN_MENU = [];

export const PAGE_PERMISSIONS = {
  executive: [ROLES.owner, ROLES.director],
  service: [ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director],
  employees: [ROLES.serviceHead, ROLES.salesManager, ROLES.director, ROLES.owner, ROLES.seo],
  director: [ROLES.director, ROLES.owner],
  sales: [ROLES.salesManager, ROLES.owner, ROLES.director],
  equipment: [ROLES.serviceEngineer, ROLES.serviceHead, ROLES.salesManager, ROLES.director, ROLES.owner],
  reports: [ROLES.serviceHead, ROLES.salesManager, ROLES.director, ROLES.owner],
  notifications: [ROLES.serviceHead, ROLES.director, ROLES.owner],
  content: [ROLES.owner, ROLES.seo],
  settings: ALL_ROLES,
};

export function getDefaultAdminSection(role) {
  if (role === ROLES.serviceEngineer) return 'service';
  if (role === ROLES.serviceHead) return 'service';
  if (role === ROLES.salesManager) return 'sales';
  if (role === ROLES.director) return 'executive';
  if (role === ROLES.seo) return 'content';
  if (role === ROLES.owner) return 'executive';
  return 'executive';
}

export const LEGACY_COMPATIBLE_ADMIN_ROLES = ALL_ROLES;
