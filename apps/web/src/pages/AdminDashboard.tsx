import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AdminDashboard() {
  const { user, logout, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  if (!user) return null;
  const submitPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Contraseña actualizada correctamente.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible cambiar la contraseña.');
    }
  };
  return (
    <main className="dashboard">
      <header className="dashboard__header">
        <div>
          <span className="eyebrow">LENSEGUA</span>
          <h1>Panel administrativo</h1>
        </div>
        <button className="button-secondary" onClick={() => void logout()}>
          Cerrar sesión
        </button>
      </header>
      <section className="card profile-card">
        <h2>
          {user.firstName} {user.lastName}
        </h2>
        <p>{user.email}</p>
        <div className="badges">
          {user.roles.map((role) => (
            <span key={role}>{role}</span>
          ))}
        </div>
      </section>
      {user.mustChangePassword && (
        <form className="card password-card" onSubmit={submitPassword}>
          <h2>Cambio de contraseña obligatorio</h2>
          <p>Debes definir una contraseña nueva antes de utilizar las funciones administrativas.</p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <label>
            Contraseña temporal
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={12}
              required
            />
          </label>
          <button type="submit">Cambiar contraseña</button>
        </form>
      )}
      {message && <div className="notice">{message}</div>}
      {!user.mustChangePassword && (
        <section className="card">
          <h2>Gestión de material educativo</h2>
          <p>Administra los módulos y sus contenidos desde este panel.</p>
          <div className="dashboard-actions">
            <Link className="button-link" to="/admin/modulos">
              Gestionar módulos
            </Link>
            <Link className="button-link" to="/admin/contenidos">
              Gestionar contenidos
            </Link>
            {user.permissions?.includes('users.read') && (
              <Link className="button-link" to="/admin/usuarios">
                Usuarios y docentes
              </Link>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
