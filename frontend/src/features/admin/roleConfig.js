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
  { key: 'service', to: 'service', label: 'Сервис', roles: [ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director] },
  { key: 'sales', to: 'sales', label: 'Продажи и клиенты', roles: [ROLES.manager, ROLES.salesManager, ROLES.owner, ROLES.director] },
  { key: 'communications', to: 'communications', label: 'Коммуникации', roles: [ROLES.manager, ROLES.salesManager, ROLES.owner, ROLES.director] },
  { key: 'employees', to: 'employees', label: 'Сотрудники', roles: [ROLES.serviceHead, ROLES.owner, ROLES.director] },
  { key: 'analytics', to: 'analytics', label: 'Аналитика', roles: [ROLES.owner, ROLES.director] },
];

export const PAGE_PERMISSIONS = {
  service: [ROLES.serviceEngineer, ROLES.serviceHead, ROLES.owner, ROLES.director],
  sales: [ROLES.manager, ROLES.salesManager, ROLES.owner, ROLES.director],
  communications: [ROLES.manager, ROLES.salesManager, ROLES.owner, ROLES.director],
  employees: [ROLES.serviceHead, ROLES.owner, ROLES.director],
  analytics: [ROLES.owner, ROLES.director],
};

export function getDefaultAdminSection(role) {
  if (role === ROLES.serviceEngineer) return 'service';
  if (role === ROLES.serviceHead) return 'service';
  if (role === ROLES.manager || role === ROLES.salesManager) return 'sales';
  if (role === ROLES.owner || role === ROLES.director) return 'employees';
  return 'service';
}

export const LEGACY_COMPATIBLE_ADMIN_ROLES = ALL_ROLES;
