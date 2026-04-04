import { useEffect, useState } from 'react';
import { adminServiceApi } from '../api/adminServiceApi';

export function AdminDashboardPage() {
  const [assignment, setAssignment] = useState({ unassignedCount: 0, overloadedEngineers: [], freeEngineers: [] });

  useEffect(() => {
    adminServiceApi.dashboard({ type: 'service_repair' })
      .then((payload) => setAssignment(payload.assignment || { unassignedCount: 0, overloadedEngineers: [], freeEngineers: [] }))
      .catch(() => setAssignment({ unassignedCount: 0, overloadedEngineers: [], freeEngineers: [] }));
  }, []);

  return (
    <section className="admin-page">
      <h1>Дашборд компании</h1>
      <ul>
        <li>Без назначения: <strong>{assignment.unassignedCount}</strong></li>
        <li>Перегруженные инженеры: <strong>{assignment.overloadedEngineers.length}</strong></li>
        <li>Свободные инженеры: <strong>{assignment.freeEngineers.length}</strong></li>
        <li>Загрузка инженеров: оперативный блок в разделе Service</li>
      </ul>
    </section>
  );
}
