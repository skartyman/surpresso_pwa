import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { adminServiceApi } from '../api/adminServiceApi';
import { AlertPanel, CompactMetricCard, Icon, KPIChipCard } from '../components/AdminUi';
import { ROLES } from '../roleConfig';

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
  const { user } = useAuth();
  const location = useLocation();
  const basePath = buildBasePath(location.pathname);
  const canDrillDown = user?.role === ROLES.owner;

  const [summary, setSummary] = useState(null);
  const [serviceCases, setServiceCases] = useState([]);
  const [salesItems, setSalesItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [summaryPayload, servicePayload, salesPayload] = await Promise.all([
          adminServiceApi.executiveSummary(),
          adminServiceApi.serviceCases().catch(() => ({ items: [] })),
          adminServiceApi.salesEquipment().catch(() => ({ items: [] })),
        ]);

        setSummary(summaryPayload.summary || null);
        setServiceCases(servicePayload.items || []);
        setSalesItems(salesPayload.items || []);
        setError('');
      } catch {
        setError('Не удалось загрузить owner executive dashboard.');
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
      { label: 'Accepted', value: serviceByStatus.accepted || 0, to: `${basePath}/service?status=accepted` },
      { label: 'In progress', value: serviceByStatus.in_progress || 0, to: `${basePath}/service?status=in_progress` },
      { label: 'Testing', value: serviceByStatus.testing || 0, to: `${basePath}/service?status=testing` },
      { label: 'Ready', value: serviceByStatus.ready || 0, to: `${basePath}/service?status=ready` },
      { label: 'Avg assign time', value: formatMinutes(service.avgAssignTimeMinutes), to: `${basePath}/service?quickFilter=unassigned` },
      { label: 'Avg repair time', value: formatMinutes(service.avgRepairTimeMinutes), to: `${basePath}/service?status=in_progress` },
      { label: 'Overdue by stage', value: Object.values(sla.overdueByStage || {}).reduce((sum, value) => sum + value, 0), to: `${basePath}/service?quickFilter=overdue` },
      { label: 'Stale ready', value: sla.staleReadyCount || 0, to: `${basePath}/service?status=ready&quickFilter=stale_ready` },
    ],
    director: [
      { label: 'Ready aging', value: director.readyAgingCount || 0, to: `${basePath}/director?serviceStatus=ready` },
      { label: 'Processed today', value: director.processedTodayCount || 0, to: `${basePath}/director?serviceStatus=processed` },
      { label: 'Route backlog', value: director.routeBacklogCount || 0, to: `${basePath}/director?commercialStatus=route_backlog` },
      { label: 'Waiting commercial routing', value: director.routeBacklogCount || 0, to: `${basePath}/director?commercialStatus=ready_for_issue` },
    ],
    sales: [
      { label: 'Ready for rent', value: salesByStatus.ready_for_rent || 0, to: `${basePath}/sales?commercialStatus=ready_for_rent` },
      { label: 'Ready for sale', value: salesByStatus.ready_for_sale || 0, to: `${basePath}/sales?commercialStatus=ready_for_sale` },
      { label: 'Reserved for rent', value: salesByStatus.reserved_for_rent || 0, to: `${basePath}/sales?commercialStatus=reserved_for_rent` },
      { label: 'Reserved for sale', value: salesByStatus.reserved_for_sale || 0, to: `${basePath}/sales?commercialStatus=reserved_for_sale` },
      { label: 'Rent backlog', value: sales.rentBacklogCount || 0, to: `${basePath}/sales?commercialStatus=rent_backlog` },
      { label: 'Sale backlog', value: sales.saleBacklogCount || 0, to: `${basePath}/sales?commercialStatus=sale_backlog` },
      { label: 'Reserved aging', value: sales.reservedAgingCount || 0, to: `${basePath}/sales?commercialStatus=reserved_aging` },
    ],
  };

  const alerts = {
    unassignedTooLong: serviceCases.filter((item) => !item.assignedToUserId && (Date.now() - new Date(item.createdAt).getTime()) > 12 * 3600000).length,
    staleInProgress: serviceCases.filter((item) => item.serviceStatus === 'in_progress' && (Date.now() - new Date(item.updatedAt).getTime()) > 48 * 3600000).length,
    staleReady: sla.staleReadyCount || 0,
    staleRentSaleBacklog: sla.staleRentSaleBacklogCount || 0,
    incompleteEquipmentData: serviceCases.filter((item) => !item.equipmentId || !item.equipment?.serial || !item.equipment?.internalNumber).length,
  };

  return (
    <section className="owner-dashboard">
      <header className="owner-hero">
        <div>
          <h2>Owner Executive Dashboard</h2>
          <p>Управленческий обзор сервиса, director queue и sales flow без операционного шума.</p>
        </div>
        <div className="owner-hero__meta">
          <KPIChipCard label="Service cases" value={serviceCases.length} icon="service" hint="Total" />
          <KPIChipCard label="Equipment in sales flow" value={salesItems.length} icon="sales" hint="Commercial" />
          <KPIChipCard label="Engineers" value={engineerRows.length} icon="employees" hint="Team" />
        </div>
      </header>

      {loading ? <p className="empty-copy">Загрузка executive summary...</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <div className="owner-grid owner-grid--3">
        <article className="owner-card">
          <header><h3><Icon name="service" /> Service Health</h3></header>
          <div className="owner-kpi-grid">
            {sectionKpis.service.map((kpi) => (
              <div key={kpi.label} className="owner-kpi-block">
                <span>{kpi.label}</span>
                <strong>{kpi.value}</strong>
                {canDrillDown ? <Link to={kpi.to}>Drill-down →</Link> : <small>Read-only</small>}
              </div>
            ))}
          </div>
        </article>

        <article className="owner-card">
          <header><h3><Icon name="dashboard" /> Director Queue Health</h3></header>
          <div className="owner-kpi-grid">
            {sectionKpis.director.map((kpi) => (
              <div key={kpi.label} className="owner-kpi-block">
                <span>{kpi.label}</span>
                <strong>{kpi.value}</strong>
                {canDrillDown ? <Link to={kpi.to}>Drill-down →</Link> : <small>Read-only</small>}
              </div>
            ))}
          </div>
        </article>

        <article className="owner-card">
          <header><h3><Icon name="sales" /> Sales Flow Health</h3></header>
          <div className="owner-kpi-grid">
            {sectionKpis.sales.map((kpi) => (
              <div key={kpi.label} className="owner-kpi-block">
                <span>{kpi.label}</span>
                <strong>{kpi.value}</strong>
                {canDrillDown ? <Link to={kpi.to}>Drill-down →</Link> : <small>Read-only</small>}
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="owner-grid owner-grid--2">
        <article className="owner-card">
          <header><h3><Icon name="employees" /> Team Performance</h3></header>
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
            {!engineerRows.length ? <p className="empty-copy">Нет данных по инженерам.</p> : null}
          </div>
        </article>

        <AlertPanel items={[
          <li key="unassigned"><span>Unassigned too long</span><strong>{alerts.unassignedTooLong}</strong></li>,
          <li key="stale_in_progress"><span>Stale in progress</span><strong>{alerts.staleInProgress}</strong></li>,
          <li key="stale_ready"><span>Stale ready</span><strong>{alerts.staleReady}</strong></li>,
          <li key="stale_rent_sale"><span>Stale rent/sale backlog</span><strong>{alerts.staleRentSaleBacklog}</strong></li>,
          <li key="equipment"><span>Incomplete equipment data</span><strong>{alerts.incompleteEquipmentData}</strong></li>,
        ]} />
      </div>
    </section>
  );
}
