import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { useI18n } from '../i18n';

export function LoginPage() {
  const { login, status } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate(location.state?.from || '/tg/admin', { replace: true });
    } catch {
      setError(t('login_error'));
    }
  }

  if (status === 'authenticated') {
    return <Navigate to="/tg/admin" replace />;
  }

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={handleSubmit} autoComplete="off">
        <h1>{t('login_title')}</h1>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" autoComplete="off" name="admin_login_email" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder={t('login_password')} autoComplete="new-password" name="admin_login_password" />
        {error ? <p className="error-text">{error}</p> : null}
        <button type="submit">{t('login_btn')}</button>
      </form>
    </div>
  );
}
