import { useMemo } from 'react';

const ICONS = {
  dashboard: 'M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-10h8V3h-8v8Z',
  service: 'm14.7 6.3 3 3-2 2 2 2-3 3-2-2-2 2-3-3 2-2-2-2 3-3 2 2 2-2ZM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  employees: 'M16 11c1.66 0 2.99-1.57 2.99-3.5S17.66 4 16 4s-3 1.57-3 3.5 1.34 3.5 3 3.5ZM8 11c1.66 0 2.99-1.57 2.99-3.5S9.66 4 8 4 5 5.57 5 7.5 6.34 11 8 11Zm0 2c-2.33 0-7 1.17-7 3.5V20h14v-3.5C15 14.17 10.33 13 8 13Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.95 1.97 3.45V20h6v-3.5c0-2.33-4.67-3.5-7-3.5Z',
  clients: 'M12 12c2.76 0 5-2.46 5-5.5S14.76 1 12 1 7 3.46 7 6.5 9.24 12 12 12Zm0 2c-4.42 0-8 2.24-8 5v2h16v-2c0-2.76-3.58-5-8-5Z',
  equipment: 'M4 6h16v7H4V6Zm2 2v3h12V8H6Zm-2 7h16v3H4v-3Z',
  sales: 'M5 4h14v2H5V4Zm0 4h10v2H5V8Zm0 4h14v2H5v-2Zm0 4h10v2H5v-2Z',
  content: 'M4 5h16v14H4V5Zm2 2v10h12V7H6Zm2 2h8v2H8V9Zm0 4h6v2H8v-2Z',
  settings: 'm19.14 12.94.04-.94-.04-.94 2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42L9.1 5.32c-.58.23-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.56 8.84a.5.5 0 0 0 .12.64l2.03 1.58-.04.94.04.94-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.4 1.05.71 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.23 1.13-.54 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z',
  search: 'm15.5 14 5 5-1.5 1.5-5-5V14l-.5-.5a6 6 0 1 1 1.5-1.5l.5.5V14ZM10 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  bell: 'M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-5c0-3.07-1.64-5.64-4.5-6.32V4a2.5 2.5 0 1 0-5 0v.68C6.64 5.36 5 7.92 5 11v5l-2 2v1h18v-1l-2-2Z',
  moon: 'M14.5 2.5A8.5 8.5 0 1 0 21 15a7 7 0 1 1-6.5-12.5Z',
  sun: 'M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0-4h1v3h-2V2h1Zm0 17h1v3h-2v-3h1ZM2 11h3v2H2v-2Zm17 0h3v2h-3v-2ZM5.64 4.22l2.12 2.12-1.42 1.42-2.12-2.12 1.42-1.42Zm12.72 12.72 2.12 2.12-1.42 1.42-2.12-2.12 1.42-1.42ZM4.22 18.36l2.12-2.12 1.42 1.42-2.12 2.12-1.42-1.42Zm12.72-12.72 2.12-2.12 1.42 1.42-2.12 2.12-1.42-1.42Z',
};

export function Icon({ name, className }) {
  const path = ICONS[name] || ICONS.settings;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className || 'ui-icon'}>
      <path d={path} fill="currentColor" />
    </svg>
  );
}

export function ThemeToggle({ theme, onToggle }) {
  return (
    <button type="button" className="theme-toggle" onClick={onToggle} aria-label="Переключить тему">
      <Icon name={theme === 'light' ? 'moon' : 'sun'} />
      <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
    </button>
  );
}

export function NotificationBell({ count = 0 }) {
  return (
    <button type="button" className="notification-bell" aria-label="Уведомления">
      <Icon name="bell" />
      {count > 0 ? <em>{count}</em> : null}
    </button>
  );
}

export function ChartCard({ title, children }) {
  return <article className="chart-card"><header><h3>{title}</h3></header>{children}</article>;
}

export function KPIChipCard({ label, value, icon, tone, hint }) {
  return <article className="kpi-chip" data-tone={tone}><span><Icon name={icon || 'dashboard'} />{label}</span><strong>{value}</strong><small>{hint}</small></article>;
}

export function StatusBadge({ status, children }) {
  return <span className="status-badge" data-status={status}>{children}</span>;
}

export function CompactMetricCard({ label, value, progress, state = 'normal' }) {
  return (
    <article className="compact-metric" data-state={state}>
      <span>{label}</span>
      <strong>{value}</strong>
      <div><i style={{ width: `${Math.min(progress, 100)}%` }} /></div>
    </article>
  );
}

export function WorkloadWidget({ items = [] }) {
  return <div className="workload-widget">{items}</div>;
}

export function AlertPanel({ items = [] }) {
  return <article className="alert-panel"><h3>Требует внимания</h3><ul>{items}</ul></article>;
}

export function FilterRow({ children }) {
  return <div className="filter-row">{children}</div>;
}

export function DetailPanel({ children }) {
  return <article className="detail-panel">{children}</article>;
}

export function useChartMax(items) {
  return useMemo(() => Math.max(...items.map((item) => item.value), 1), [items]);
}
