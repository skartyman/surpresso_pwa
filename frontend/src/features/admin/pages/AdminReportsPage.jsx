import { useEffect, useMemo, useState } from 'react';
import { adminServiceApi } from '../api/adminServiceApi';
import { Icon, KPIChipCard } from '../components/AdminUi';

function reportUrl(endpoint) {
  return `/api/telegram${endpoint}`;
}

export function AdminReportsPage() {
  const [history, setHistory] = useState([]);
  const [presets, setPresets] = useState([]);
  const [weekly, setWeekly] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [historyPayload, presetsPayload, weeklyPayload] = await Promise.all([
          adminServiceApi.reportsHistory().catch(() => ({ items: [] })),
          adminServiceApi.reportPresets().catch(() => ({ items: [] })),
          adminServiceApi.weeklyExecutiveReport().catch(() => null),
        ]);
        setHistory(historyPayload.items || []);
        setPresets(presetsPayload.items || []);
        setWeekly(weeklyPayload || null);
        setError('');
      } catch {
        setError('Не удалось загрузить отчёты.');
      }
    }
    load();
  }, []);

  const exportLinks = useMemo(() => ([
    { key: 'service', label: 'Service Cases CSV', href: reportUrl('/admin/reports/service-cases.csv') },
    { key: 'executive', label: 'Executive Summary CSV', href: reportUrl('/admin/reports/executive-summary.csv') },
    { key: 'sales', label: 'Sales Flow CSV', href: reportUrl('/admin/reports/sales-flow.csv') },
  ]), []);

  return (
    <section className="service-dashboard">
      <header className="service-headline">
        <div>
          <h2>Reports</h2>
          <p>Экспорт, presets и история выгрузок на существующих backend endpoint'ах.</p>
        </div>
      </header>

      <div className="kpi-row">
        <KPIChipCard label="Export history" value={history.length} icon="reports" hint="Последние выгрузки" />
        <KPIChipCard label="Presets" value={presets.length} icon="settings" hint="Сохранённые шаблоны" />
        <KPIChipCard label="Weekly executive" value={weekly ? 'ready' : '—'} icon="dashboard" hint="Executive report" />
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <article className="owner-card">
        <header><h3><Icon name="reports" /> Export endpoints</h3></header>
        <div className="quick-filter-row">
          {exportLinks.map((item) => <a key={item.key} className="admin-action-link" href={item.href} target="_blank" rel="noreferrer">{item.label}</a>)}
        </div>
      </article>

      <div className="owner-grid owner-grid--2">
        <article className="owner-card">
          <header><h3>Export history</h3></header>
          <ul className="simple-list">
            {history.slice(0, 20).map((item) => (
              <li key={item.id || `${item.reportType}-${item.createdAt}`}>
                {item.reportType || 'report'} · {item.createdAt ? new Date(item.createdAt).toLocaleString('ru-RU') : '—'}
              </li>
            ))}
            {!history.length ? <li>История выгрузок пуста.</li> : null}
          </ul>
        </article>

        <article className="owner-card">
          <header><h3>Report presets</h3></header>
          <ul className="simple-list">
            {presets.map((item) => (
              <li key={item.id || item.name}>{item.name || 'Без названия'} {item.createdAt ? `· ${new Date(item.createdAt).toLocaleDateString('ru-RU')}` : ''}</li>
            ))}
            {!presets.length ? <li>Сохранённых preset пока нет.</li> : null}
          </ul>
        </article>
      </div>
    </section>
  );
}
