import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import { ApiError, apiFetch } from '../lib/api';
import type { ManagedUser, UserRole, UsersResponse } from '../types/users';
import './users.css';

type Action =
  { kind: 'create' } | { kind: 'edit' | 'roles' | 'password' | 'status'; user: ManagedUser };
const roles: UserRole[] = ['DOCENTE', 'ADMINISTRADOR'];
const roleLabel = (role: UserRole) => (role === 'DOCENTE' ? 'Docente' : 'Administrador');
const fullName = (user: ManagedUser) => `${user.firstName} ${user.lastName}`;

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const messages: Record<string, string> = {
      EMAIL_EXISTS: 'Ya existe una cuenta con ese correo electrónico.',
      USER_NOT_FOUND: 'Esta cuenta ya no está disponible. Actualiza la lista.',
      SELF_DEACTIVATION: 'No puedes desactivar tu propia cuenta.',
      SELF_ROLE_CHANGE: 'Debes conservar tu propio rol de administrador.',
      FORBIDDEN: 'No tienes permiso para realizar esta acción.',
      PASSWORD_CHANGE_REQUIRED: 'Primero debes cambiar tu contraseña temporal desde Inicio.',
      VALIDATION_ERROR: 'Revisa los datos y los requisitos de la contraseña.',
    };
    return (
      messages[error.code ?? ''] ?? 'No fue posible completar la solicitud. Intenta nuevamente.'
    );
  }
  return 'No fue posible conectar con el servidor. Revisa tu conexión e intenta nuevamente.';
}

function UserDialog({
  action,
  onClose,
  onSaved,
}: {
  action: Action;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const target = action.kind === 'create' ? undefined : action.user;
  const [firstName, setFirstName] = useState(target?.firstName ?? '');
  const [lastName, setLastName] = useState(target?.lastName ?? '');
  const [email, setEmail] = useState(target?.email ?? '');
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>(target?.roles ?? ['DOCENTE']);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLDivElement>(null);
  const needsPassword = action.kind === 'create' || action.kind === 'password';
  const needsRoles = action.kind === 'create' || action.kind === 'roles';
  const titles = {
    create: 'Crear usuario',
    edit: 'Editar datos',
    roles: 'Asignar roles',
    password: 'Restablecer contraseña',
    status: target?.status === 'ACTIVE' ? 'Desactivar cuenta' : 'Activar cuenta',
  };
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (needsRoles && selectedRoles.length === 0) {
      setError('Selecciona al menos un rol.');
      return;
    }
    if (needsPassword) {
      if (
        password.length < 12 ||
        password.length > 128 ||
        !/[a-z]/.test(password) ||
        !/[A-Z]/.test(password) ||
        !/[0-9]/.test(password) ||
        !/[^A-Za-z0-9]/.test(password)
      ) {
        setError(
          'La contraseña debe tener entre 12 y 128 caracteres, mayúscula, minúscula, número y símbolo.',
        );
        return;
      }
      if (password !== confirmation) {
        setError('Las contraseñas no coinciden.');
        return;
      }
    }
    setBusy(true);
    try {
      const base = `/api/users/${target?.id}`;
      if (action.kind === 'create') {
        await apiFetch('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
            roles: selectedRoles,
            temporaryPassword: password,
          }),
        });
      } else if (action.kind === 'edit') {
        await apiFetch(base, {
          method: 'PATCH',
          body: JSON.stringify({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
          }),
        });
      } else if (action.kind === 'roles') {
        await apiFetch(`${base}/roles`, {
          method: 'PUT',
          body: JSON.stringify({ roles: selectedRoles }),
        });
      } else if (action.kind === 'password') {
        await apiFetch(`${base}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ temporaryPassword: password }),
        });
      } else {
        await apiFetch(`${base}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: target?.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
        });
      }
      setPassword('');
      setConfirmation('');
      onSaved(
        action.kind === 'create'
          ? 'Usuario creado. Deberá cambiar su contraseña temporal al ingresar.'
          : action.kind === 'password'
            ? 'Contraseña restablecida. Se cerraron las sesiones anteriores y se exigirá cambiarla al ingresar.'
            : action.kind === 'roles'
              ? 'Roles actualizados. La persona deberá iniciar sesión nuevamente.'
              : action.kind === 'status'
                ? `Cuenta ${target?.status === 'ACTIVE' ? 'desactivada' : 'activada'} correctamente.`
                : 'Datos del usuario actualizados.',
      );
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="user-dialog"
      aria-labelledby="user-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
        <header className="user-dialog__header">
          <div>
            <span className="eyebrow">Administración de cuentas</span>
            <h2 id="user-dialog-title">{titles[action.kind]}</h2>
            {target && (
              <p>
                {fullName(target)} · {target.email}
              </p>
            )}
          </div>
          <button
            type="button"
            className="icon-button"
            disabled={busy}
            onClick={onClose}
            aria-label="Cerrar formulario"
          >
            ×
          </button>
        </header>
        {error && (
          <div ref={errorRef} className="error" role="alert" tabIndex={-1}>
            {error}
          </div>
        )}
        <fieldset disabled={busy} className="user-dialog__fields">
          {(action.kind === 'create' || action.kind === 'edit') && (
            <>
              <div className="user-name-grid">
                <label>
                  Nombres
                  <input
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    required
                    maxLength={100}
                    autoComplete="off"
                  />
                </label>
                <label>
                  Apellidos
                  <input
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    required
                    maxLength={100}
                    autoComplete="off"
                  />
                </label>
              </div>
              <label>
                Correo electrónico
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  maxLength={320}
                  autoComplete="off"
                />
              </label>
            </>
          )}
          {needsRoles && (
            <fieldset className="user-role-options">
              <legend>Roles de la cuenta</legend>
              {roles.map((role) => (
                <label key={role}>
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes(role)}
                    onChange={(event) =>
                      setSelectedRoles((current) =>
                        event.target.checked
                          ? [...current, role]
                          : current.filter((item) => item !== role),
                      )
                    }
                  />
                  <span>
                    <strong>{roleLabel(role)}</strong>
                    <small>
                      {role === 'DOCENTE'
                        ? 'Gestiona contenidos y material educativo.'
                        : 'Tiene acceso completo, incluida la gestión de cuentas.'}
                    </small>
                  </span>
                </label>
              ))}
              {action.kind === 'roles' && <p>El cambio cerrará las sesiones de esta persona.</p>}
            </fieldset>
          )}
          {needsPassword && (
            <>
              <p className="user-password-help" id="user-password-help">
                Usa entre 12 y 128 caracteres, con mayúscula, minúscula, número y símbolo. Entrega
                la contraseña temporal a la persona; deberá cambiarla al ingresar.
                {action.kind === 'password' &&
                  ' También se desbloquearán los intentos fallidos y se cerrarán sus sesiones anteriores.'}
              </p>
              <label>
                Contraseña temporal
                <input
                  type={visible ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  aria-describedby="user-password-help"
                />
              </label>
              <label>
                Confirmar contraseña temporal
                <input
                  type={visible ? 'text' : 'password'}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <div className="user-password-tools">
                <label>
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={(event) => setVisible(event.target.checked)}
                  />
                  Mostrar contraseñas
                </label>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    const generated = `Lg!7${crypto.randomUUID()}`;
                    setPassword(generated);
                    setConfirmation(generated);
                    setVisible(true);
                  }}
                >
                  Generar contraseña
                </button>
              </div>
            </>
          )}
          {action.kind === 'status' && (
            <p>
              {target?.status === 'ACTIVE'
                ? 'Esta persona perderá el acceso al panel y se cerrarán sus sesiones. Sus contenidos se conservarán.'
                : 'Esta persona podrá volver a iniciar sesión con su contraseña actual. Si no la recuerda, puedes restablecerla después de activar la cuenta.'}
            </p>
          )}
        </fieldset>
        <footer className="form-actions">
          <button type="button" className="button-secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            className={
              action.kind === 'status' && target?.status === 'ACTIVE' ? 'button-danger' : ''
            }
          >
            {busy ? 'Guardando…' : action.kind === 'status' ? titles.status : 'Guardar cambios'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export function UsersPage() {
  const { user } = useAuth();
  const can = (permission: string) => !!user?.permissions?.includes(permission);
  const allowed = can('users.read') && !user?.mustChangePassword;
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ search: '', role: '', status: '', page: 1 });
  const [result, setResult] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [action, setAction] = useState<Action | null>(null);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ page: String(filters.page), pageSize: '20' });
    if (filters.search) query.set('search', filters.search);
    if (filters.role) query.set('role', filters.role);
    if (filters.status) query.set('status', filters.status);
    void apiFetch<UsersResponse>(`/api/users?${query}`, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.users.length === 0 && data.pagination.total > 0 && filters.page > 1) {
          setFilters((current) => ({ ...current, page: Math.max(1, data.pagination.pages) }));
          return;
        }
        setResult(data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [allowed, filters, revision]);
  if (user?.mustChangePassword) return <Navigate to="/admin" replace />;
  if (!allowed)
    return (
      <main className="page">
        <h1>Acceso restringido</h1>
        <p>No tienes permiso para administrar usuarios.</p>
        <Link to="/admin">Volver al inicio</Link>
      </main>
    );
  return (
    <main className="page users-page">
      <header className="page-header page-header--actions">
        <div>
          <span className="eyebrow">Administración</span>
          <h1>Usuarios y docentes</h1>
          <p>Gestiona las cuentas y el acceso al panel de LENSEGUA.</p>
        </div>
        {can('users.create') && (
          <button
            onClick={() => {
              setMessage('');
              setAction({ kind: 'create' });
            }}
          >
            Crear usuario
          </button>
        )}
      </header>
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <form
        className="card users-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters((current) => ({ ...current, search: searchInput.trim(), page: 1 }));
        }}
      >
        <label>
          Buscar por nombre o correo
          <input
            type="search"
            value={searchInput}
            maxLength={100}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Nombre, apellido o correo"
          />
        </label>
        <label>
          Rol
          <select
            value={filters.role}
            onChange={(event) =>
              setFilters((current) => ({ ...current, role: event.target.value, page: 1 }))
            }
          >
            <option value="">Todos los roles</option>
            {roles.map((role) => (
              <option key={role} value={role}>
                {roleLabel(role)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({ ...current, status: event.target.value, page: 1 }))
            }
          >
            <option value="">Todos los estados</option>
            <option value="ACTIVE">Activo</option>
            <option value="INACTIVE">Inactivo</option>
          </select>
        </label>
        <button type="submit">Buscar</button>
      </form>
      {loading ? (
        <div className="loading" role="status">
          Cargando usuarios…
        </div>
      ) : error ? (
        <div className="error" role="alert">
          {error}{' '}
          <button
            className="button-secondary"
            onClick={() => setRevision((current) => current + 1)}
          >
            Reintentar
          </button>
        </div>
      ) : (
        result && (
          <>
            <p className="users-count" role="status">
              {result.pagination.total}{' '}
              {result.pagination.total === 1 ? 'cuenta encontrada' : 'cuentas encontradas'}
            </p>
            {result.users.length === 0 ? (
              <div className="empty">No hay usuarios que coincidan con los filtros.</div>
            ) : (
              <div className="users-list">
                {result.users.map((item) => {
                  const own = item.id === user?.id;
                  const locked =
                    item.lockedUntil && new Date(item.lockedUntil).getTime() > Date.now();
                  return (
                    <article className="card user-card" key={item.id}>
                      <div className="user-card__identity">
                        <div className="user-avatar" aria-hidden="true">
                          {item.firstName.charAt(0)}
                          {item.lastName.charAt(0)}
                        </div>
                        <div>
                          <h2>
                            {fullName(item)}
                            {own && <small>Tu cuenta</small>}
                          </h2>
                          <p>{item.email}</p>
                          <div className="badges">
                            {item.roles.map((role) => (
                              <span key={role}>{roleLabel(role)}</span>
                            ))}
                            <span
                              className={item.status === 'ACTIVE' ? 'user-active' : 'user-inactive'}
                            >
                              {item.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>
                          <div className="user-card__security">
                            {item.mustChangePassword && <span>Cambio de contraseña pendiente</span>}
                            {locked && <span>Bloqueo temporal por intentos fallidos</span>}
                            <span>
                              Último ingreso:{' '}
                              {item.lastLoginAt
                                ? new Date(item.lastLoginAt).toLocaleString('es-GT', {
                                    timeZone: 'America/Guatemala',
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  })
                                : 'Sin ingresos'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="actions" aria-label={`Acciones para ${fullName(item)}`}>
                        {can('users.update') && (
                          <button
                            className="button-secondary"
                            onClick={() => setAction({ kind: 'edit', user: item })}
                          >
                            Editar datos
                          </button>
                        )}
                        {can('users.roles.assign') && !own && (
                          <button
                            className="button-secondary"
                            onClick={() => setAction({ kind: 'roles', user: item })}
                          >
                            Roles
                          </button>
                        )}
                        {can('users.password.reset') && !own && (
                          <button
                            className="button-secondary"
                            onClick={() => setAction({ kind: 'password', user: item })}
                          >
                            Restablecer contraseña
                          </button>
                        )}
                        {can('users.status') && !own && (
                          <button
                            className={item.status === 'ACTIVE' ? 'button-danger' : ''}
                            onClick={() => setAction({ kind: 'status', user: item })}
                          >
                            {item.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                          </button>
                        )}
                      </div>
                      {own && (
                        <p className="user-own-note">
                          La desactivación, los roles y el restablecimiento de tu cuenta los
                          gestiona otro administrador.
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
            {result.pagination.pages > 1 && (
              <nav className="pagination" aria-label="Páginas de usuarios">
                <button
                  className="button-secondary"
                  disabled={filters.page <= 1}
                  onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
                >
                  Anterior
                </button>
                <span>
                  Página {filters.page} de {result.pagination.pages}
                </span>
                <button
                  className="button-secondary"
                  disabled={filters.page >= result.pagination.pages}
                  onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
                >
                  Siguiente
                </button>
              </nav>
            )}
          </>
        )
      )}
      {action && (
        <UserDialog
          action={action}
          onClose={() => setAction(null)}
          onSaved={(text) => {
            setAction(null);
            setMessage(text);
            setRevision((current) => current + 1);
          }}
        />
      )}
    </main>
  );
}
