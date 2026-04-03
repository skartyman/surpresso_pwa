export const ROLES = {
  service_engineer: 'service_engineer',
  service_head: 'service_head',
  sales_manager: 'sales_manager',
  owner: 'owner',
  director: 'director',
};

export const ROLE_LABELS = {
  [ROLES.service_engineer]: 'Service engineer',
  [ROLES.service_head]: 'Service head',
  [ROLES.sales_manager]: 'Sales manager',
  [ROLES.owner]: 'Owner',
  [ROLES.director]: 'Director',
};

export const ADMIN_MENU = [
  { to: '/admin/service', label: 'Сервис', roles: [ROLES.service_engineer, ROLES.service_head, ROLES.owner, ROLES.director] },
  { to: '/admin/sales', label: 'Продажи и клиенты', roles: [ROLES.sales_manager, ROLES.owner, ROLES.director] },
  { to: '/admin/communications', label: 'Коммуникации', roles: [ROLES.sales_manager, ROLES.owner, ROLES.director] },
  { to: '/admin/employees', label: 'Сотрудники', roles: [ROLES.service_head, ROLES.owner, ROLES.director] },
  { to: '/admin/analytics', label: 'Аналитика', roles: [ROLES.owner, ROLES.director] },
];

export const PAGE_PERMISSIONS = {
  '/admin/service': [ROLES.service_engineer, ROLES.service_head, ROLES.owner, ROLES.director],
  '/admin/sales': [ROLES.sales_manager, ROLES.owner, ROLES.director],
  '/admin/communications': [ROLES.sales_manager, ROLES.owner, ROLES.director],
  '/admin/employees': [ROLES.service_head, ROLES.owner, ROLES.director],
  '/admin/analytics': [ROLES.owner, ROLES.director],
};
