import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AdminLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="admin-shell">
      <aside className={`sidebar ${open ? 'sidebar--open' : ''}`}>
        <div className="sidebar__brand">LENSEGUA</div>
        <nav onClick={() => setOpen(false)}>
          <NavLink end to="/admin">
            Inicio
          </NavLink>
          <NavLink to="/admin/modulos">Módulos</NavLink>
          <NavLink to="/admin/contenidos" data-cy="nav-contents">
            Contenidos
          </NavLink>
          {!user?.mustChangePassword && user?.permissions?.includes('users.read') && (
            <NavLink to="/admin/usuarios">Usuarios y docentes</NavLink>
          )}
          <NavLink to="/">Ver portal educativo ↗</NavLink>
        </nav>
        <div className="sidebar__user" data-cy="admin-user">
          <strong>{user?.firstName}</strong>
          <span>{user?.roles.join(', ')}</span>
        </div>
        <button className="button-secondary" onClick={() => void logout()}>
          Cerrar sesión
        </button>
      </aside>
      <div className="admin-main">
        <header className="mobile-header">
          <button
            className="menu-button"
            onClick={() => setOpen((value) => !value)}
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <strong>LENSEGUA</strong>
        </header>
        {open && (
          <button
            className="sidebar-backdrop"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
          />
        )}
        <Outlet />
      </div>
    </div>
  );
}
