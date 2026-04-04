export const ROLES = {
  manager: 'manager',
  serviceEngineer: 'service_engineer',
  serviceHead: 'service_head',
  salesManager: 'sales_manager',
  owner: 'owner',
  director: 'director',
};

export const ROLE_LABELS = {
  [ROLES.manager]: 'Менеджер',
  [ROLES.serviceEngineer]: 'Сервисный инженер',
  [ROLES.serviceHead]: 'Руководитель сервиса',
  [ROLES.salesManager]: 'Менеджер по продажам',
  [ROLES.owner]: 'Собственник',
  [ROLES.director]: 'Директор',
};

const ALL_ROLES = Object.values(ROLES);

export const ADMIN_MENU = [
  { key: 'dashboard', to: 'dashboard', icon: 'dashboard', label: 'Дашборд', roles: ALL_ROLES },
  { key: 'service', to: 'service', icon: 'service', label: 'Сервис', roles: [ROLES.manager, ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director] },
  { key: 'employees', to: 'employees', icon: 'employees', label: 'Сотрудники', roles: [ROLES.manager, ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director] },
  { key: 'clients', to: 'clients', icon: 'clients', label: 'Клиенты', roles: [ROLES.manager, ROLES.salesManager, ROLES.owner, ROLES.director] },
  { key: 'equipment', to: 'equipment', icon: 'equipment', label: 'Оборудование', roles: [ROLES.manager, ROLES.serviceHead, ROLES.owner, ROLES.director] },
  { key: 'sales', to: 'sales', icon: 'sales', label: 'Продажи', roles: [ROLES.manager, ROLES.salesManager, ROLES.owner, ROLES.director] },
  { key: 'content', to: 'content', icon: 'content', label: 'Контент и SEO', roles: [ROLES.manager, ROLES.salesManager, ROLES.owner, ROLES.director] },
  { key: 'settings', to: 'settings', icon: 'settings', label: 'Настройки', roles: ALL_ROLES },
];

export const PAGE_PERMISSIONS = {
  dashboard: ALL_ROLES,
  service: [ROLES.manager, ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director],
  sales: [ROLES.manager, ROLES.salesManager, ROLES.owner, ROLES.director],
  employees: [ROLES.manager, ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director],
  clients: [ROLES.manager, ROLES.salesManager, ROLES.owner, ROLES.director],
  equipment: [ROLES.manager, ROLES.serviceHead, ROLES.owner, ROLES.director],
  content: [ROLES.manager, ROLES.salesManager, ROLES.owner, ROLES.director],
  settings: ALL_ROLES,
};

export function getDefaultAdminSection(role) {
  if (role === ROLES.serviceEngineer || role === ROLES.serviceHead || role === ROLES.manager) return 'service';
  if (role === ROLES.salesManager) return 'sales';
  if (role === ROLES.owner || role === ROLES.director) return 'dashboard';
  return 'service';
}

export const LEGACY_COMPATIBLE_ADMIN_ROLES = ALL_ROLES;
