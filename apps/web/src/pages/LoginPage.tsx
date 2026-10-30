import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { user, login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  if (user) return <Navigate to="/admin" replace />;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(email, password);
      navigate((location.state as { from?: string } | null)?.from ?? '/admin', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible iniciar sesión.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <span className="eyebrow">Panel administrativo</span>
        <h1>LENSEGUA</h1>
        <p>Acceso exclusivo para administradores y docentes.</p>
        {sessionExpired && (
          <div className="notice">Tu sesión expiró. Inicia sesión nuevamente.</div>
        )}
        {error && (
          <div className="error" role="alert" data-cy="login-error">
            {error}
          </div>
        )}
        <label>
          Correo electrónico
          <input
            type="email"
            data-cy="login-email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            data-cy="login-password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={submitting} data-cy="login-submit">
          {submitting ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
