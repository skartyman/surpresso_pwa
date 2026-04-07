import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { adminServiceApi } from '../api/adminServiceApi';
import { AlertPanel, CompactMetricCard, Icon, KPIChipCard } from '../components/AdminUi';
import { ROLES } from '../roleConfig';
import { useAdminI18n } from '../adminI18n';

function formatMinutes(value) {
  return Number.isFinite(value) ? `${value} мин` : '—';
}

function pluralizeCases(value) {
  const count = Number(value || 0);
  if (count % 10 === 1 && count % 100 !== 11) return `${count} кейс`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return `${count} кейса`;
  return `${count} кейсов`;
}

function buildBasePath(pathname) {
  return pathname.startsWith('/tg/admin') ? '/tg/admin' : '/admin';
}

export function AdminDashboardPage() {
  const { t } = useAdminI18n();
  const { user } = useAuth();
  const location = useLocation();
  const basePath = buildBasePath(location.pathname);
  const canDrillDown = user?.role === ROLES.owner;

  const [summary, setSummary] = useState(null);
  const [alertsState, setAlertsState] = useState(null);
  const [notificationState, setNotificationState] = useState(null);
  const [serviceCases, setServiceCases] = useState([]);
  const [salesItems, setSalesItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [summaryPayload, servicePayload, salesPayload, notificationPayload] = await Promise.all([
          adminServiceApi.executiveSummary(),
          adminServiceApi.serviceCases().catch(() => ({ items: [] })),
          adminServiceApi.salesEquipment().catch(() => ({ items: [] })),
          adminServiceApi.notificationsPreview().catch(() => ({ notificationPreview: { pendingCritical: 0, pendingWarning: 0, digestSize: 0 }, templates: {} })),
        ]);

        setSummary(summaryPayload.summary || null);
        setAlertsState(summaryPayload.alerts || null);
        setNotificationState(notificationPayload || null);
        setServiceCases(servicePayload.items || []);
        setSalesItems(salesPayload.items || []);
        setError('');
      } catch {
        setError('Не удалось загрузить управленческую сводку.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const serviceByStatus = useMemo(() => serviceCases.reduce((acc, item) => {
    const key = item.serviceStatus || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {}), [serviceCases]);

  const salesByStatus = useMemo(() => salesItems.reduce((acc, item) => {
    const key = item.commercialStatus || 'none';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {}), [salesItems]);

  const engineerRows = useMemo(() => {
    const map = new Map();
    for (const item of serviceCases) {
      if (!item.assignedToUserId) continue;
      const key = item.assignedToUserId;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: item.assignedToUser?.fullName || key,
          total: 0,
          overdue: 0,
          repairSamples: [],
        });
      }
      const row = map.get(key);
      row.total += 1;
      const ageHours = (Date.now() - new Date(item.updatedAt).getTime()) / 3600000;
      if (
        (item.serviceStatus === 'accepted' && ageHours > 12)
        || (item.serviceStatus === 'in_progress' && ageHours > 48)
        || (item.serviceStatus === 'testing' && ageHours > 24)
        || (item.serviceStatus === 'ready' && ageHours > 24)
      ) {
        row.overdue += 1;
      }
      if (item.assignedAt && item.readyAt) {
        const diff = Math.round((new Date(item.readyAt).getTime() - new Date(item.assignedAt).getTime()) / 60000);
        if (Number.isFinite(diff) && diff >= 0) row.repairSamples.push(diff);
      }
    }

    return [...map.values()]
      .map((row) => {
        const avgRepair = row.repairSamples.length
          ? Math.round(row.repairSamples.reduce((sum, value) => sum + value, 0) / row.repairSamples.length)
          : null;
        return { ...row, avgRepair };
      })
      .sort((a, b) => b.total - a.total);
  }, [serviceCases]);

  const service = summary?.service || {};
  const director = summary?.director || {};
  const sales = summary?.sales || {};
  const sla = summary?.sla || {};

  const sectionKpis = {
    service: [
      { label: 'Принято', value: serviceByStatus.accepted || 0, to: `${basePath}/service?status=accepted` },
      { label: 'В работе', value: serviceByStatus.in_progress || 0, to: `${basePath}/service?status=in_progress` },
      { label: 'Тестирование', value: serviceByStatus.testing || 0, to: `${basePath}/service?status=testing` },
      { label: 'Готово', value: serviceByStatus.ready || 0, to: `${basePath}/service?status=ready` },
      { label: 'Среднее время назначения', value: formatMinutes(service.avgAssignTimeMinutes), to: `${basePath}/service?quickFilter=unassigned` },
      { label: 'Среднее время ремонта', value: formatMinutes(service.avgRepairTimeMinutes), to: `${basePath}/service?status=in_progress` },
      { label: 'Просрочено по этапам', value: Object.values(sla.overdueByStage || {}).reduce((sum, value) => sum + value, 0), to: `${basePath}/service?quickFilter=overdue` },
      { label: 'Залежалось в готово', value: sla.staleReadyCount || 0, to: `${basePath}/service?status=ready&quickFilter=stale_ready` },
    ],
    director: [
      { label: 'Задержка готовых', value: director.readyAgingCount || 0, to: `${basePath}/director?serviceStatus=ready` },
      { label: 'Обработано сегодня', value: director.processedTodayCount || 0, to: `${basePath}/director?serviceStatus=processed` },
      { label: 'Бэклог маршрутизации', value: director.routeBacklogCount || 0, to: `${basePath}/director?commercialStatus=route_backlog` },
      { label: 'Ждут коммерческого решения', value: director.routeBacklogCount || 0, to: `${basePath}/director?commercialStatus=ready_for_issue` },
    ],
    sales: [
      { label: 'Готово к аренде', value: salesByStatus.ready_for_rent || 0, to: `${basePath}/sales?commercialStatus=ready_for_rent` },
      { label: 'Готово к продаже', value: salesByStatus.ready_for_sale || 0, to: `${basePath}/sales?commercialStatus=ready_for_sale` },
      { label: 'Бронь аренды', value: salesByStatus.reserved_for_rent || 0, to: `${basePath}/sales?commercialStatus=reserved_for_rent` },
      { label: 'Бронь продажи', value: salesByStatus.reserved_for_sale || 0, to: `${basePath}/sales?commercialStatus=reserved_for_sale` },
      { label: 'Бэклог аренды', value: sales.rentBacklogCount || 0, to: `${basePath}/sales?commercialStatus=rent_backlog` },
      { label: 'Бэклог продажи', value: sales.saleBacklogCount || 0, to: `${basePath}/sales?commercialStatus=sale_backlog` },
      { label: 'Задержка в бронях', value: sales.reservedAgingCount || 0, to: `${basePath}/sales?commercialStatus=reserved_aging` },
    ],
  };

  const alertsSummary = alertsState?.summary || {};
  const alertsByType = alertsSummary.byType || {};
  const escalationBlocks = alertsState?.escalationBlocks || {};
  const recentCritical = alertsState?.recentCriticalChanges || [];
  const notificationPreview = notificationState?.notificationPreview || { pendingCritical: 0, pendingWarning: 0, digestSize: 0 };

  return (
    <section className="owner-dashboard">
      <header className="owner-hero">
        <div>
          <h2>{t('executive_title')}</h2>
          <p>{t('executive_subtitle')}</p>
        </div>
        <div className="owner-hero__meta">
          <KPIChipCard label={t('service_cases')} value={serviceCases.length} icon="service" hint={t('service_total')} />
          <KPIChipCard label={t('equipment_in_sales')} value={salesItems.length} icon="sales" hint={t('commercial_total')} />
          <KPIChipCard label={t('engineers')} value={engineerRows.length} icon="employees" hint={t('team_total')} />
        </div>
      </header>

      {loading ? <p className="empty-copy">{t('loading_executive')}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <div className="owner-grid owner-grid--3">
        <article className="owner-card">
          <header><h3><Icon name="service" /> {t('service_health')}</h3></header>
          <div className="owner-kpi-grid">
            {sectionKpis.service.map((kpi) => (
              <div key={kpi.label} className="owner-kpi-block">
                <span>{kpi.label}</span>
                <strong>{kpi.value}</strong>
          {canDrillDown ? <Link to={kpi.to}>{t('drill_down')}</Link> : <small>{t('read_only')}</small>}
              </div>
            ))}
          </div>
        </article>

        <article className="owner-card">
          <header><h3><Icon name="dashboard" /> {t('director_health')}</h3></header>
          <div className="owner-kpi-grid">
            {sectionKpis.director.map((kpi) => (
              <div key={kpi.label} className="owner-kpi-block">
                <span>{kpi.label}</span>
                <strong>{kpi.value}</strong>
          {canDrillDown ? <Link to={kpi.to}>{t('drill_down')}</Link> : <small>{t('read_only')}</small>}
              </div>
            ))}
          </div>
        </article>

        <article className="owner-card">
          <header><h3><Icon name="sales" /> {t('sales_health')}</h3></header>
          <div className="owner-kpi-grid">
            {sectionKpis.sales.map((kpi) => (
              <div key={kpi.label} className="owner-kpi-block">
                <span>{kpi.label}</span>
                <strong>{kpi.value}</strong>
          {canDrillDown ? <Link to={kpi.to}>{t('drill_down')}</Link> : <small>{t('read_only')}</small>}
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="owner-grid owner-grid--2">
        <article className="owner-card">
          <header><h3><Icon name="employees" /> {t('team_performance')}</h3></header>
          <div className="team-performance-grid">
            {engineerRows.slice(0, 8).map((row) => (
              <CompactMetricCard
                key={row.id}
                label={row.name}
                value={`${pluralizeCases(row.total)} · overdue ${row.overdue} · avg ${formatMinutes(row.avgRepair)}`}
                progress={Math.min(100, Math.round((row.total / Math.max(engineerRows[0]?.total || 1, 1)) * 100))}
                state={row.overdue > 2 ? 'danger' : row.overdue > 0 ? 'warning' : 'calm'}
              />
            ))}
            {!engineerRows.length ? <p className="empty-copy">{t('no_engineer_data')}</p> : null}
          </div>
        </article>

        <AlertPanel items={[
          <li key="unassigned"><span>Слишком долго без назначения</span><strong>{alertsByType.unassigned_too_long || 0}</strong></li>,
          <li key="stale_in_progress"><span>Застряли в работе</span><strong>{alertsByType.stale_in_progress || 0}</strong></li>,
          <li key="stale_ready"><span>Залежались в готово</span><strong>{alertsByType.stale_ready || 0}</strong></li>,
          <li key="stale_reserved"><span>Задержка в резерве</span><strong>{alertsByType.stale_reserved || 0}</strong></li>,
          <li key="overdue_by_stage"><span>Просрочено по этапам</span><strong>{alertsByType.overdue_by_stage || 0}</strong></li>,
          <li key="equipment"><span>Неполные данные по оборудованию</span><strong>{alertsByType.incomplete_equipment_data || 0}</strong></li>,
        ]} />
      </div>

      <div className="owner-grid owner-grid--2">
        <article className="owner-card">
          <header><h3><Icon name="dashboard" /> {t('escalations')}</h3></header>
          <ul className="simple-list">
            <li>{t('service_head')}: {(escalationBlocks.serviceHead || []).length}</li>
            <li>{t('nav_director')}: {(escalationBlocks.director || []).length}</li>
            <li>{t('sales_short')}: {(escalationBlocks.salesManager || []).length}</li>
            <li>{t('role_owner')}: {(escalationBlocks.owner || []).length}</li>
          </ul>
          <p className="muted-copy">{t('notification_preview')}: {t('critical')} {notificationPreview.pendingCritical}, {t('warning')} {notificationPreview.pendingWarning}, {t('digest')} {notificationPreview.digestSize}.</p>
        </article>
        <article className="owner-card">
          <header><h3><Icon name="service" /> {t('recent_critical_changes')}</h3></header>
          <ul className="simple-list">
            {recentCritical.slice(0, 5).map((item, idx) => <li key={`${item.caseId || idx}-${item.type}`}>{item.message || item.type}</li>)}
            {!recentCritical.length ? <li>{t('no_critical_changes')}</li> : null}
          </ul>
        </article>
      </div>
    </section>
  );
}
