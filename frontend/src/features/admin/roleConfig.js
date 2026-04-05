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

export const ADMIN_MENU = [
  { key: 'dashboard', to: 'dashboard', icon: 'dashboard', label: 'Дашборд', roles: [ROLES.owner, ROLES.serviceHead] },
  { key: 'service', to: 'service', icon: 'service', label: 'Сервис', roles: [ROLES.manager, ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner] },
  { key: 'director', to: 'director', icon: 'dashboard', label: 'Director Queue', roles: [ROLES.director, ROLES.owner] },
  { key: 'employees', to: 'employees', icon: 'employees', label: 'Сотрудники', roles: [ROLES.manager, ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner] },
  { key: 'clients', to: 'clients', icon: 'clients', label: 'Клиенты', roles: [ROLES.manager, ROLES.owner] },
  { key: 'equipment', to: 'equipment', icon: 'equipment', label: 'Оборудование', roles: [ROLES.manager, ROLES.serviceHead, ROLES.owner] },
  { key: 'sales', to: 'sales', icon: 'sales', label: 'Продажи', roles: [ROLES.salesManager, ROLES.owner] },
  { key: 'content', to: 'content', icon: 'content', label: 'Контент и SEO', roles: [ROLES.manager, ROLES.owner, ROLES.seo] },
  { key: 'settings', to: 'settings', icon: 'settings', label: 'Настройки', roles: [ROLES.owner, ROLES.director, ROLES.manager] },
];

export const PAGE_PERMISSIONS = {
  dashboard: [ROLES.owner, ROLES.serviceHead],
  service: [ROLES.manager, ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner],
  director: [ROLES.director, ROLES.owner],
  sales: [ROLES.salesManager, ROLES.owner],
  employees: [ROLES.manager, ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner],
  clients: [ROLES.manager, ROLES.owner],
  equipment: [ROLES.manager, ROLES.serviceHead, ROLES.owner],
  content: [ROLES.manager, ROLES.owner, ROLES.seo],
  settings: ALL_ROLES,
};

export function getDefaultAdminSection(role) {
  if (role === ROLES.serviceEngineer || role === ROLES.serviceHead || role === ROLES.manager) return 'service';
  if (role === ROLES.salesManager) return 'sales';
  if (role === ROLES.director) return 'director';
  if (role === ROLES.owner) return 'dashboard';
  return 'service';
}

export const LEGACY_COMPATIBLE_ADMIN_ROLES = ALL_ROLES;
