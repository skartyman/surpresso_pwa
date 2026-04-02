import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

export function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('manager@surpresso.local');
  const [password, setPassword] = useState('Manager123!');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate(location.state?.from || '/admin', { replace: true });
    } catch {
      setError('Неверный логин или пароль');
    }
  }

  if (status === 'authenticated') {
    return <Navigate to="/admin" replace />;
  }

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={handleSubmit}>
        <h1>Вход в админку</h1>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" autoComplete="username" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Пароль" autoComplete="current-password" />
        {error ? <p className="error-text">{error}</p> : null}
        <button type="submit">Войти</button>
      </form>
    </div>
  );
}
