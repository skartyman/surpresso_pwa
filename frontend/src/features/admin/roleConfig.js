export const ROLES = {
  manager: 'manager',
  serviceEngineer: 'service_engineer',
  serviceHead: 'service_head',
  salesManager: 'sales_manager',
  owner: 'owner',
  director: 'director',
  seo: 'seo',
};

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

export const ADMIN_SECTIONS = [
  {
    key: 'operations',
    label: 'Operations',
    items: [
      { key: 'service', to: 'service', icon: 'service', label: 'Service', roles: [ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner] },
      { key: 'director', to: 'director', icon: 'dashboard', label: 'Director', roles: [ROLES.director, ROLES.owner] },
      { key: 'sales', to: 'sales', icon: 'sales', label: 'Sales', roles: [ROLES.salesManager, ROLES.owner] },
      { key: 'equipment', to: 'equipment', icon: 'equipment', label: 'Equipment', roles: [ROLES.serviceEngineer, ROLES.serviceHead, ROLES.salesManager, ROLES.director, ROLES.owner] },
    ],
  },
  {
    key: 'management',
    label: 'Management',
    items: [
      { key: 'executive', to: 'executive', icon: 'dashboard', label: 'Executive', roles: [ROLES.director, ROLES.owner] },
      { key: 'reports', to: 'reports', icon: 'reports', label: 'Reports', roles: [ROLES.serviceHead, ROLES.salesManager, ROLES.director, ROLES.owner] },
      { key: 'notifications', to: 'notifications', icon: 'bell', label: 'Notification Center', roles: [ROLES.serviceHead, ROLES.director, ROLES.owner] },
    ],
  },
  {
    key: 'content',
    label: 'Content',
    items: [
      { key: 'content', to: 'content', icon: 'content', label: 'Content / SEO', roles: [ROLES.seo, ROLES.owner] },
    ],
  },
  {
    key: 'system',
    label: 'System',
    items: [
      { key: 'settings', to: 'settings', icon: 'settings', label: 'Settings', roles: ALL_ROLES },
    ],
  },
];

export const ADMIN_MENU = ADMIN_SECTIONS.flatMap((section) => section.items);

export const PAGE_PERMISSIONS = {
  executive: [ROLES.owner, ROLES.director],
  service: [ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner],
  director: [ROLES.director, ROLES.owner],
  sales: [ROLES.salesManager, ROLES.owner],
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
