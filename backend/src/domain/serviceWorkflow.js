export function buildServiceStatusSideEffects({ fromStatus, toStatus, actorUserId, now = new Date() }) {
  const patch = { updatedAt: now };

  if (fromStatus === 'accepted' && toStatus === 'in_progress') patch.assignedAt = now;
  if (toStatus === 'testing') patch.testingAt = now;
  if (toStatus === 'ready') patch.readyAt = now;
  if (toStatus === 'processed') {
    patch.processedAt = now;
    patch.processedByUserId = actorUserId || null;
  }
  if (toStatus === 'closed') patch.closedAt = now;

  return patch;
}

export const SERVICE_BOARD_COLUMNS = [
  { key: 'accepted', title: 'Принятые' },
  { key: 'in_progress', title: 'В работе' },
  { key: 'testing', title: 'Тест' },
  { key: 'ready', title: 'Готово директору' },
];

export const DIRECTOR_BOARD_COLUMNS = [
  { key: 'ready', title: 'Ожидают проведения' },
  { key: 'processed', title: 'Проведено' },
  { key: 'ready_for_issue', title: 'Готово к выдаче' },
  { key: 'ready_for_rent', title: 'Готово к аренде' },
  { key: 'ready_for_sale', title: 'Готово к продаже' },
];

export const SALES_BOARD_COLUMNS = [
  { key: 'ready_for_rent', title: 'Готово к аренде' },
  { key: 'reserved_for_rent', title: 'Бронь к аренде' },
  { key: 'out_on_rent', title: 'В аренде' },
  { key: 'out_on_replacement', title: 'На подмене' },
  { key: 'ready_for_sale', title: 'Готово к продаже' },
  { key: 'reserved_for_sale', title: 'Бронь к продаже' },
  { key: 'sold', title: 'Продано' },
];

export function normalizeLegacyStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();

  if (['прийнято на ремонт', 'приехало после аренды', 'приехало с подмены'].includes(s)) {
    return { serviceStatus: 'accepted', commercialStatus: 'none' };
  }
  if (s === 'в роботі') return { serviceStatus: 'in_progress', commercialStatus: 'none' };
  if (s === 'готово') return { serviceStatus: 'ready', commercialStatus: 'none' };
  if (s === 'видано клієнту') return { serviceStatus: 'closed', commercialStatus: 'issued_to_client' };
  if (s === 'готово к аренде') return { serviceStatus: 'closed', commercialStatus: 'ready_for_rent' };
  if (s === 'уехало на аренду') return { serviceStatus: 'closed', commercialStatus: 'out_on_rent' };
  if (s === 'уехало на подмену') return { serviceStatus: 'closed', commercialStatus: 'out_on_replacement' };
  if (s === 'продано') return { serviceStatus: 'closed', commercialStatus: 'sold' };

  return { serviceStatus: null, commercialStatus: 'none' };
}
