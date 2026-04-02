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
import { routes } from './routes';

export function App() {
  useTelegramWebApp();
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
        <Route path="*" element={<Navigate to={routes.home} replace />} />
      </Routes>
    </AppShell>
  );
}
