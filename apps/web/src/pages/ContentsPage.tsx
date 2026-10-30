import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiFetch } from '../lib/api';
import type { EducationalContent, EducationalModule, PublicationStatus } from '../types/content';

const statusLabel: Record<PublicationStatus, string> = {
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicado',
  INACTIVE: 'Inactivo',
};
export function ContentsPage() {
  const { user } = useAuth();
  const [contents, setContents] = useState<EducationalContent[]>([]);
  const [modules, setModules] = useState<EducationalModule[]>([]);
  const [moduleId, setModuleId] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '10' });
      if (moduleId) params.set('moduleId', moduleId);
      if (status) params.set('status', status);
      if (search) params.set('search', search);
      const result = await apiFetch<{
        contents: EducationalContent[];
        pagination: { pages: number; total: number };
      }>(`/api/contents?${params}`);
      setContents(result.contents);
      setPages(result.pagination.pages);
      setTotal(result.pagination.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible cargar los contenidos.');
    } finally {
      setLoading(false);
    }
  }, [moduleId, status, search, page]);
  useEffect(() => {
    void apiFetch<{ modules: EducationalModule[] }>('/api/modules').then((result) =>
      setModules(result.modules),
    );
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const changeStatus = async (item: EducationalContent, next: PublicationStatus) => {
    if (!window.confirm(`¿Confirmas cambiar “${item.title}” a ${statusLabel[next].toLowerCase()}?`))
      return;
    setError('');
    try {
      await apiFetch(`/api/contents/${item.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      setMessage('Estado actualizado correctamente.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No fue posible cambiar el estado.');
    }
  };
  return (
    <main className="page" data-cy="contents-page">
      <header className="page-header page-header--actions">
        <div>
          <span className="eyebrow">Material educativo</span>
          <h1>Contenidos</h1>
          <p>{total} registros encontrados</p>
        </div>
        {user?.permissions?.includes('content.create') && (
          <Link className="button-link" to="/admin/contenidos/nuevo" data-cy="new-content">
            Nuevo contenido
          </Link>
        )}
      </header>
      <section className="card filters">
        <label>
          Buscar
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Título o descripción"
          />
        </label>
        <label>
          Módulo
          <select
            value={moduleId}
            onChange={(event) => {
              setModuleId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {modules.map((module) => (
              <option key={module.id} value={module.id}>
                {module.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Estado
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            <option value="DRAFT">Borrador</option>
            <option value="PUBLISHED">Publicado</option>
            <option value="INACTIVE">Inactivo</option>
          </select>
        </label>
      </section>
      {message && (
        <div className="notice" data-cy="content-success">
          {message}
        </div>
      )}
      {error && (
        <div className="error" role="alert" data-cy="contents-error">
          {error}
        </div>
      )}
      {loading ? (
        <div className="loading">Cargando contenidos…</div>
      ) : contents.length === 0 ? (
        <div className="empty">
          <h2>Sin contenidos</h2>
          <p>Crea un borrador o modifica los filtros.</p>
        </div>
      ) : (
        <div className="content-list">
          {contents.map((item) => (
            <article className="card content-row" key={item.id} data-cy="content-row">
              <div>
                <div className="content-row__meta">
                  <span>{item.module.title}</span>
                  <span
                    className={`status status--${item.status.toLowerCase()}`}
                    data-cy="content-status"
                  >
                    {statusLabel[item.status]}
                  </span>
                  <span>Orden {item.sortOrder}</span>
                </div>
                <h2>{item.title}</h2>
                <p>{item.summary || 'Sin descripción breve.'}</p>
              </div>
              <div className="actions">
                <Link
                  data-cy="edit-content"
                  className="button-link button-link--secondary"
                  to={`/admin/contenidos/${item.id}/editar`}
                >
                  Editar
                </Link>
                {item.status !== 'PUBLISHED' && user?.permissions?.includes('content.publish') && (
                  <button
                    onClick={() => void changeStatus(item, 'PUBLISHED')}
                    data-cy="publish-content"
                  >
                    Publicar
                  </button>
                )}
                {item.status !== 'INACTIVE' &&
                  user?.permissions?.includes('content.deactivate') && (
                    <button
                      className="button-danger"
                      data-cy="deactivate-content"
                      onClick={() => void changeStatus(item, 'INACTIVE')}
                    >
                      Desactivar
                    </button>
                  )}
                {item.status === 'INACTIVE' && user?.permissions?.includes('content.update') && (
                  <button
                    className="button-secondary"
                    onClick={() => void changeStatus(item, 'DRAFT')}
                  >
                    Pasar a borrador
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {pages > 1 && (
        <nav className="pagination">
          <button
            className="button-secondary"
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            Anterior
          </button>
          <span>
            Página {page} de {pages}
          </span>
          <button
            className="button-secondary"
            disabled={page === pages}
            onClick={() => setPage((value) => value + 1)}
          >
            Siguiente
          </button>
        </nav>
      )}
    </main>
  );
}
