import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { AuthProvider } from './features/auth/AuthContext';
import './styles/app.css';
import { I18nProvider } from './i18n';
import { AdminI18nProvider } from './features/admin/adminI18n';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/tg">
      <AuthProvider>
        <I18nProvider>
          <AdminI18nProvider>
            <App />
          </AdminI18nProvider>
        </I18nProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
