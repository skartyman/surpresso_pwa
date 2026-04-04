export const WORK_MODES = ['field', 'inhouse', 'hybrid'];

export const SERVICE_SPECIALIZATIONS = [
  'autoCoffee',
  'proCoffee',
  'grinder',
  'filtration',
  'electronics',
  'fieldService',
];

export const SERVICE_BRANDS = [
  'saeco',
  'delonghi',
  'philips',
  'jura',
  'nuovaSimonelli',
  'astoria',
  'mahlkonig',
  'fiorenzato',
  'ecosoft',
];

export const SERVICE_ZONES = [
  'kyiv-center',
  'kyiv-left-bank',
  'kyiv-right-bank',
  'kyiv-region',
  'remote-ua',
];

export function normalizeStringList(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((item) => String(item || '').trim()).filter(Boolean))];
}
