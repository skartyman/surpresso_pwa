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
import { PAGE_PERMISSIONS, getDefaultAdminSection } from '../features/admin/roleConfig';
import { AdminPlaceholderPage } from '../features/admin/pages/AdminPlaceholderPage';
import { AdminServicePage } from '../features/admin/pages/AdminServicePage';
import { AdminDashboardPage } from '../features/admin/pages/AdminDashboardPage';
import { AdminSalesPage } from '../features/admin/pages/AdminSalesPage';
import { AdminDirectorPage } from '../features/admin/pages/AdminDirectorPage';
import { AdminEquipmentPage } from '../features/admin/pages/AdminEquipmentPage';
import { AdminReportsPage } from '../features/admin/pages/AdminReportsPage';
import { AdminNotificationCenterPage } from '../features/admin/pages/AdminNotificationCenterPage';
import { useI18n } from '../i18n';

function ClientRoutes() {
  const { t } = useI18n();
  return (
    <AppShell>
      <Routes>
        <Route path={routes.home} element={<HomePage />} />
        <Route path={routes.equipment} element={<EquipmentPage />} />
        <Route path={`${routes.equipment}/:equipmentId`} element={<EquipmentCardPage />} />
        <Route path={routes.service} element={<ServicePage />} />
        <Route path={`${routes.requestForm}/:requestType`} element={<ServicePage />} />
        <Route path={`${routes.service}/:requestId`} element={<ServiceStatusPage />} />
        <Route path={routes.support} element={<SupportPage />} />
        <Route path={routes.rentals} element={<PlaceholderPage title={t('rentals')} />} />
        <Route path={routes.coffee} element={<PlaceholderPage title={t('coffee')} />} />
        <Route path={routes.supplies} element={<PlaceholderPage title={t('supplies')} />} />
        <Route path={routes.guides} element={<PlaceholderPage title={t('guides')} />} />
      </Routes>
    </AppShell>
  );
}

function RoleHomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={getDefaultAdminSection(user?.role)} replace />;
}

function AdminRoutes({ basePath }) {
  return (
    <Route path={basePath} element={<AdminLayout />}>
      <Route index element={<RoleHomeRedirect />} />

      <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS.executive} />}>
        <Route path="executive" element={<AdminDashboardPage />} />
        <Route path="dashboard" element={<Navigate to="../executive" replace />} />
      </Route>

      <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS.service} />}>
        <Route path="service" element={<AdminServicePage />} />
      </Route>

      <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS.director} />}>
        <Route path="director" element={<AdminDirectorPage />} />
      </Route>

      <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS.sales} />}>
        <Route path="sales" element={<AdminSalesPage />} />
      </Route>

      <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS.equipment} />}>
        <Route path="equipment" element={<AdminEquipmentPage />} />
        <Route path="equipment/:equipmentId" element={<AdminEquipmentPage />} />
      </Route>

      <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS.reports} />}>
        <Route path="reports" element={<AdminReportsPage />} />
      </Route>

      <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS.notifications} />}>
        <Route path="notifications" element={<AdminNotificationCenterPage />} />
      </Route>

      <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS.content} />}>
        <Route path="content" element={<AdminPlaceholderPage title="Content / SEO" items={['Лендинги', 'Статьи', 'Поисковые запросы', 'Мета-шаблоны']} />} />
      </Route>

      <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS.settings} />}>
        <Route path="settings" element={<AdminPlaceholderPage title="Settings" items={['Роли', 'Интеграции', 'Шаблоны уведомлений']} />} />
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
