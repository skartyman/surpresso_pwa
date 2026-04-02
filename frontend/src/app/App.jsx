import { useTelegramWebApp } from '../features/auth/useTelegramWebApp';
import { Route, Routes } from 'react-router-dom';
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
import { AdminLayout } from '../features/admin/components/AdminLayout';
import { PAGE_PERMISSIONS } from '../features/admin/roleConfig';
import { AdminPlaceholderPage } from '../features/admin/pages/AdminPlaceholderPage';

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

export function App() {
  useTelegramWebApp();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/403" element={<ForbiddenPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS['/admin']} />}>
            <Route index element={<AdminPlaceholderPage title="Заявки и заказы" items={['Заявки', 'Аренда', 'Заказы']} />} />
          </Route>
          <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS['/admin/service']} />}>
            <Route path="service" element={<AdminPlaceholderPage title="Сервис" items={['Сервисные заявки', 'Фото', 'Комментарии', 'Статусы']} />} />
          </Route>
          <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS['/admin/clients']} />}>
            <Route path="clients" element={<AdminPlaceholderPage title="Клиенты" items={['Карточки клиентов', 'Контракты', 'Контакты']} />} />
          </Route>
          <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS['/admin/equipment']} />}>
            <Route path="equipment" element={<AdminPlaceholderPage title="Оборудование" items={['Каталог', 'История сервиса', 'Состояние']} />} />
          </Route>
          <Route element={<RequireRole allowedRoles={PAGE_PERMISSIONS['/admin/content']} />}>
            <Route path="content" element={<AdminPlaceholderPage title="Контент и SEO" items={['Новости', 'Афиши', 'Страницы', 'Медиа']} />} />
          </Route>
        </Route>
      </Route>

      <Route path="/*" element={<ClientRoutes />} />
    </Routes>
  );
}
