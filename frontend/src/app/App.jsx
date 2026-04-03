import { useTelegramWebApp } from '../features/auth/useTelegramWebApp';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../layouts/AppShell';
import { HomePage } from '../pages/HomePage';
import { EquipmentPage } from '../pages/EquipmentPage';
import { EquipmentCardPage } from '../pages/EquipmentCardPage';
import { ServicePage } from '../pages/ServicePage';
import { ServiceStatusPage } from '../pages/ServiceStatusPage';
import { SupportPage } from '../pages/SupportPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { LoginPage } from '../pages/LoginPage';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { routes } from './routes';
import { RequireAuth, RequireRole } from '../features/auth/guards';
import { useAuth } from '../features/auth/AuthContext';
import { AdminLayout } from '../features/admin/components/AdminLayout';
import { PAGE_PERMISSIONS, getDefaultAdminSection, ROLES } from '../features/admin/roleConfig';
import { AdminPlaceholderPage } from '../features/admin/pages/AdminPlaceholderPage';
import { AdminServicePage } from '../features/admin/pages/AdminServicePage';
import { AdminEmployeesPage } from '../features/admin/pages/AdminEmployeesPage';
import { AdminDashboardPage } from '../features/admin/pages/AdminDashboardPage';

function ClientRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path={routes.home} element={<HomePage />} />
        <Route path={routes.equipment} element={<EquipmentPage />} />
        <Route path={`${routes.equipment}/:equipmentId`} element={<EquipmentCardPage />} />
        <Route path={routes.service} element={<ServicePage />} />
        <Route path={`${routes.service}/:requestId`} element={<ServiceStatusPage />} />
        <Route path={routes.support} element={<SupportPage />} />
        <Route path={routes.rentals} element={<PlaceholderPage title="Аренда" />} />
        <Route path={routes.coffee} element={<PlaceholderPage title="Кофе" />} />
        <Route path={routes.supplies} element={<PlaceholderPage title="Расходники" />} />
        <Route path={routes.guides} element={<PlaceholderPage title="Инструкции" />} />
      </Routes>
    </AppShell>
  );
}

function RoleHomeRedirect() {
  const { user } = useAuth();
  if (user?.role === ROLES.owner || user?.role === ROLES.director) {
    return <Navigate to="dashboard" replace />;
  }
  return <Navigate to={getDefaultAdminSection(user?.role)} replace />;
}

function AdminRoutes({ basePath }) {
  return (
    <Route path={basePath} element={<AdminLayout />}>
      <Route index element={<RoleHomeRedirect />} />
      <Route path="dashboard" element={<AdminDashboardPage />} />

      <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS.service} />}>
        <Route path="service" element={<AdminServicePage />} />
      </Route>

      <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS['sales-clients']} />}>
        <Route path="sales-clients" element={<AdminPlaceholderPage title="Продажи и обращения" items={['Продажи', 'Карточки клиентов', 'Сделки']} />} />
      </Route>

      <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS.communications} />}>
        <Route path="communications" element={<AdminPlaceholderPage title="Коммуникации" items={['Обращения', 'История общения', 'Каналы связи']} />} />
      </Route>

      <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS.employees} />}>
        <Route path="employees" element={<AdminEmployeesPage />} />
      </Route>

      <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS.analytics} />}>
        <Route path="analytics" element={<AdminPlaceholderPage title="Аналитика" items={['Финансы', 'Service KPI', 'Воронка продаж']} />} />
      </Route>
    </Route>
  );
}

export function App() {
  useTelegramWebApp();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/tg/login" element={<LoginPage />} />
      <Route path="/403" element={<ForbiddenPage />} />

      <Route element={<RequireAuth />}>
        {AdminRoutes({ basePath: '/admin' })}
        {AdminRoutes({ basePath: '/tg/admin' })}
      </Route>

      <Route path="/*" element={<ClientRoutes />} />
    </Routes>
  );
}
