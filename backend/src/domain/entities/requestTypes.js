export const REQUEST_TYPES = {
  serviceRepair: 'service_repair',
  serviceRepairRemote: 'service_repair_remote',
  serviceRepairVisit: 'service_repair_visit',
  coffeeOrder: 'coffee_order',
  coffeeTasting: 'coffee_tasting',
  grinderCheck: 'grinder_check',
  rentalAuto: 'rental_auto',
  rentalPro: 'rental_pro',
  feedback: 'feedback',
};

export const REQUEST_DEPARTMENTS = {
  service: 'service',
  sales: 'sales',
};

export const ALL_REQUEST_TYPES = Object.values(REQUEST_TYPES);

export function resolveDepartmentByType(type) {
  if ([REQUEST_TYPES.serviceRepair, REQUEST_TYPES.serviceRepairRemote, REQUEST_TYPES.serviceRepairVisit].includes(type)) {
    return REQUEST_DEPARTMENTS.service;
  }
  return REQUEST_DEPARTMENTS.sales;
}

export function normalizeRequestType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ALL_REQUEST_TYPES.includes(normalized) ? normalized : null;
}
