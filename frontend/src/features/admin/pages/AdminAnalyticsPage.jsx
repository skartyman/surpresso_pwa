import { useEffect, useState } from 'react';
import { adminAnalyticsApi } from '../api/adminAnalyticsApi';

export function AdminAnalyticsPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    adminAnalyticsApi.summary().then(setData);
  }, []);

  const dashboards = data?.dashboards;

  return (
    <section className="admin-page">
      <h1>Аналитика компании</h1>
      {!dashboards ? <p>Загрузка...</p> : (
        <>
          <p>Всего заявок: {dashboards.service?.totals?.requests ?? 0}</p>
          <p>Открытые заявки: {dashboards.service?.totals?.open ?? 0}</p>
          <p>Закрытые заявки: {dashboards.service?.totals?.closed ?? 0}</p>
          <p>Активные сотрудники: {dashboards.company?.activeEmployees ?? 0}</p>
          <h3>KPI / Heatmaps</h3>
          <pre>{JSON.stringify({ kpi: dashboards.service?.kpi, heatmap: dashboards.service?.heatmap }, null, 2)}</pre>
        </>
      )}
    </section>
  );
}
