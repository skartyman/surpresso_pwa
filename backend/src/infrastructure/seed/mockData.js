export const seed = {
  clients: [
    {
      id: 'client-1',
      telegramUserId: 123456789,
      companyName: 'Surpresso Partner Coffee',
      managerName: 'Анна',
      createdAt: '2026-03-01T09:00:00.000Z',
    },
  ],
  equipment: [
    {
      id: 'eq-101',
      clientId: 'client-1',
      model: 'La Marzocco Linea PB',
      serialNumber: 'LM-2234-7781',
      internalNumber: 'SPB-001',
      status: 'active',
      serviceHistory: [
        { id: 'hist-1', date: '2026-03-24', action: 'Плановое ТО' },
        { id: 'hist-2', date: '2026-02-02', action: 'Замена помпы' },
      ],
    },
  ],
  serviceRequests: [
    {
      id: 'req-5001',
      clientId: 'client-1',
      equipmentId: 'eq-101',
      category: 'coffee_machine',
      description: 'Давление нестабильно во второй группе',
      urgency: 'high',
      canOperate: true,
      media: [],
      status: 'in_progress',
      createdAt: '2026-03-31T10:15:00.000Z',
      updatedAt: '2026-03-31T11:00:00.000Z',
    },
  ],
};
