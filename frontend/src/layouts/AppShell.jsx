import { BottomNav } from '../components/BottomNav';

export function AppShell({ children }) {
  return (
    <div className="app-shell">
      <main className="page">{children}</main>
      <BottomNav />
    </div>
  );
}
