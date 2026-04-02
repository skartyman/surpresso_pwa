const demoEquipment = [
  {
    id: 'eq-101',
    model: 'La Marzocco Linea PB',
    serialNumber: 'LM-2234-7781',
    internalNumber: 'SPB-001',
    status: 'active',
    serviceHistory: [
      { id: 'srv-1', date: '2026-03-24', action: 'Плановое ТО' },
      { id: 'srv-2', date: '2026-02-02', action: 'Замена помпы' },
    ],
  },
  {
    id: 'eq-102',
    model: 'Mahlkönig E80 Supreme',
    serialNumber: 'MK-9921-1288',
    internalNumber: 'SPG-017',
    status: 'service_required',
    serviceHistory: [{ id: 'srv-3', date: '2026-03-10', action: 'Калибровка жерновов' }],
  },
];

const serviceRequests = [
  {
    id: 'req-5001',
    equipmentId: 'eq-102',
    category: 'grinder',
    status: 'in_progress',
    urgency: 'high',
    description: 'Появился шум и нестабильный помол',
    canOperate: true,
    createdAt: '2026-03-31T10:15:00.000Z',
  },
];

export const mockApi = {
  me: async () => ({ id: 'client-1', companyName: 'Surpresso Partner', managerName: 'Анна' }),
  equipmentList: async () => demoEquipment,
  equipmentById: async (id) => demoEquipment.find((item) => item.id === id),
  requestHistory: async () => serviceRequests,
};
