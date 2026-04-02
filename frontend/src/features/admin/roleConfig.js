export const ROLES = {
  manager: 'manager',
  service: 'service',
  seo: 'seo',
};

export const ROLE_LABELS = {
  [ROLES.manager]: 'Manager',
  [ROLES.service]: 'Service',
  [ROLES.seo]: 'SEO',
};

export const ADMIN_MENU = [
  { to: '/admin', label: 'Заявки и заказы', roles: [ROLES.manager] },
  { to: '/admin/service', label: 'Сервис', roles: [ROLES.manager, ROLES.service] },
  { to: '/admin/clients', label: 'Клиенты', roles: [ROLES.manager] },
  { to: '/admin/equipment', label: 'Оборудование', roles: [ROLES.manager, ROLES.service] },
  { to: '/admin/content', label: 'Контент и SEO', roles: [ROLES.manager, ROLES.seo] },
];

export const PAGE_PERMISSIONS = {
  '/admin': [ROLES.manager],
  '/admin/service': [ROLES.manager, ROLES.service],
  '/admin/clients': [ROLES.manager],
  '/admin/equipment': [ROLES.manager, ROLES.service],
  '/admin/content': [ROLES.manager, ROLES.seo],
};
